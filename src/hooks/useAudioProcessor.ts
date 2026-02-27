import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { frequencyToNote } from '../utils/musicUtils';

interface AudioResult {
  frequency: number | null;
  noteName: string | null;
  cents: number | null;
}

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({ frequency: null, noteName: null, cents: null });
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096));

  const processFrame = useCallback(() => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    analyser.getFloatTimeDomainData(buffer);

    const rms = computeRMS(buffer);
    if (rms < 0.005) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const freq = detectPitch(buffer, audioCtxRef.current.sampleRate);
    if (freq !== null) {
      const noteInfo = frequencyToNote(freq);
      setResult({ frequency: freq, noteName: noteInfo.fullName, cents: noteInfo.cents });
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, []);

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

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);
      rafRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, [processFrame]);

  const stopListening = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({ frequency: null, noteName: null, cents: null });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};