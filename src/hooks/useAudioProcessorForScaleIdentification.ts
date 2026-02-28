/**
 * Simplified audio processing hook for scale identification.
 * Unlike useAudioProcessor (which measures cents for tuning accuracy),
 * this hook focuses on quick pitch-class recognition — just the note name,
 * no cents deviation, no harmonic analysis.
 *
 * Design choices for faster note registration:
 *  - Smaller FFT buffer (2048 instead of 4096) → lower latency
 *  - Lower RMS gate (0.003) so softer strikes are caught
 *  - No validateFundamental / harmonic analysis overhead
 *  - Reports only the pitch-class name ("C", "F#", etc.)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { frequencyToNote } from '../utils/musicUtils';

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
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));

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

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;
        const buf = bufferRef.current;
        analyserRef.current.getFloatTimeDomainData(buf);

        const rms = computeRMS(buf);
        if (rms >= 0.003) {
          const freq = detectPitch(buf, audioCtxRef.current.sampleRate);
          if (freq !== null) {
            const noteInfo = frequencyToNote(freq);
            setResult({ pitchClass: noteInfo.name, noteFullName: noteInfo.fullName, frequency: freq, rms });
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
