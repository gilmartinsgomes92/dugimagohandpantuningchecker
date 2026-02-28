/**
 * Simplified audio processing hook for scale identification.
 * Unlike useAudioProcessor (which measures cents for tuning accuracy),
 * this hook focuses on quick pitch-class recognition — just the note name,
 * no cents deviation.
 *
 * Design choices:
 *  - Lower RMS gate (0.003) so softer strikes are caught.
 *  - Pitch-class stability filter: a note is only reported after the same
 *    pitch class (e.g. "D") has appeared for STABILITY_FRAMES consecutive
 *    frames (~80 ms at 60 fps). This eliminates the frame-by-frame flicker
 *    between the true fundamental (D3) and its harmonics (D4, A4) that
 *    validateFundamental-based approaches produced, and ensures the
 *    ScaleIdentifierPage's 350 ms hold-timer actually completes.
 *  - No validateFundamental / FFT harmonic analysis: that approach caused
 *    the opposite problem (D3 → D2 or D3 → A4) when the magnitude
 *    comparison thresholds were not met during the resonance decay.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { frequencyToNote } from '../utils/musicUtils';

/**
 * Number of consecutive audio frames the same pitch class must appear before
 * it is reported as the detected note. At ~60 fps this equals ~80 ms — long
 * enough to filter out transient harmonics (1–3 frames) while being short
 * enough that the user barely notices the latency.
 */
const STABILITY_FRAMES = 5;

interface ScaleIdentificationResult {
  /** Detected pitch-class name, e.g. "C#", or null when silent/unstable */
  pitchClass: string | null;
  /** Full note name including octave, e.g. "C#4", or null when silent/unstable */
  noteFullName: string | null;
  /** Raw frequency in Hz, or null */
  frequency: number | null;
  /** Root-mean-square amplitude of the current audio frame (always ≥ 0) */
  rms: number;
}

export const useAudioProcessorForScaleIdentification = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<ScaleIdentificationResult>({
    pitchClass: null,
    noteFullName: null,
    frequency: null,
    rms: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  // Stability filter state: track consecutive frames with the same pitch class
  const stabilityCountRef = useRef(0);
  const stablePitchClassRef = useRef<string | null>(null);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      // Reset stability state at the start of each session
      stabilityCountRef.current = 0;
      stablePitchClassRef.current = null;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;
        const buf = bufferRef.current;
        analyserRef.current.getFloatTimeDomainData(buf);

        const rms = computeRMS(buf);

        if (rms < 0.003) {
          // Silent frame: reset stability so transient noise never accumulates
          stabilityCountRef.current = 0;
          stablePitchClassRef.current = null;
          setResult({ pitchClass: null, noteFullName: null, frequency: null, rms });
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const rawFreq = detectPitch(buf, audioCtxRef.current.sampleRate);
        if (rawFreq === null) {
          stabilityCountRef.current = 0;
          stablePitchClassRef.current = null;
          setResult({ pitchClass: null, noteFullName: null, frequency: null, rms });
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const noteInfo = frequencyToNote(rawFreq);

        // Accumulate consecutive frames with the same pitch class.
        // D3 and D4 share pitch class "D" so octave ambiguity is tolerated;
        // once stable the current frame's fullName (usually the fundamental)
        // is what gets reported.
        if (noteInfo.name === stablePitchClassRef.current) {
          stabilityCountRef.current++;
        } else {
          stablePitchClassRef.current = noteInfo.name;
          stabilityCountRef.current = 1;
        }

        if (stabilityCountRef.current >= STABILITY_FRAMES) {
          setResult({
            pitchClass: noteInfo.name,
            noteFullName: noteInfo.fullName,
            frequency: rawFreq,
            rms,
          });
        } else {
          // Still building stability — report silence so the page timer
          // doesn't start prematurely; always include rms for cooldown escape.
          setResult({ pitchClass: null, noteFullName: null, frequency: null, rms });
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({ pitchClass: null, noteFullName: null, frequency: null, rms: 0 });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};
