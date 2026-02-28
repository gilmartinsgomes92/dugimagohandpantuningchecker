/**
 * Simplified audio processing hook for scale identification.
 * Unlike useAudioProcessor (which measures cents for tuning accuracy),
 * this hook focuses on quick pitch-class recognition — just the note name,
 * no cents deviation.
 *
 * Design choices for faster note registration:
 *  - FFT buffer size 4096 (same as main hook) — needed for validateFundamental
 *    which uses the frequency-domain data to correct octave errors
 *  - Lower RMS gate (0.003) so softer strikes are caught
 *  - Uses validateFundamental from harmonicAnalyzer to reject frames where
 *    YIN locks onto the 2nd harmonic (e.g. D4 instead of D3)
 *  - Minimum frequency floor of 80 Hz to prevent false sub-octave corrections:
 *    the validateFundamental sub-octave check can redirect D3 (147 Hz) to D2
 *    (73 Hz) when room/HVAC noise at 73 Hz is within 6 dB of D3; handpan
 *    fundamentals are always above 120 Hz so 80 Hz safely excludes D2.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { frequencyToNote } from '../utils/musicUtils';
import { validateFundamental } from '../utils/harmonicAnalyzer';

/** Lowest frequency (Hz) that can be a handpan note. D2 = 73.4 Hz; D3 = 146.8 Hz. */
const MIN_HANDPAN_FREQ = 80;

interface ScaleIdentificationResult {
  /** Detected pitch-class name, e.g. "C#", or null when silent */
  pitchClass: string | null;
  /** Full note name including octave, e.g. "C#4", or null when silent */
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
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096));
  // Frequency-domain buffer for FFT magnitude data (dB), used by validateFundamental
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      freqBufRef.current = new Float32Array(analyser.fftSize / 2);

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;
        const buf = bufferRef.current;
        analyserRef.current.getFloatTimeDomainData(buf);
        analyserRef.current.getFloatFrequencyData(freqBufRef.current);

        const rms = computeRMS(buf);
        if (rms >= 0.003) {
          const rawFreq = detectPitch(buf, audioCtxRef.current.sampleRate);
          if (rawFreq !== null) {
            // Correct for octave errors using FFT harmonic analysis, same as
            // the main tuning hook. Without this, YIN frequently locks onto
            // the 2nd harmonic (2× the fundamental), causing D3 to read as D4.
            const freq = validateFundamental(
              rawFreq,
              freqBufRef.current,
              audioCtxRef.current.sampleRate,
              analyserRef.current.fftSize,
            );
            if (freq !== null && freq >= MIN_HANDPAN_FREQ) {
              const noteInfo = frequencyToNote(freq);
              setResult({ pitchClass: noteInfo.name, noteFullName: noteInfo.fullName, frequency: freq, rms });
            } else {
              setResult({ pitchClass: null, noteFullName: null, frequency: null, rms });
            }
          } else {
            setResult({ pitchClass: null, noteFullName: null, frequency: null, rms });
          }
        } else {
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
