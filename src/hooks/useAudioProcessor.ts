import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { validateFundamental } from '../utils/harmonicAnalyzer';
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
        if (rms >= 0.005) {
          const rawFreq = detectPitch(buf, audioCtxRef.current.sampleRate);
          if (rawFreq !== null) {
            // Correct for octave errors: if the sub-octave has a comparable FFT
            // peak the lower frequency is the true fundamental (YIN locked onto 2nd harmonic)
            const freq = validateFundamental(
              rawFreq,
              freqBufRef.current,
              audioCtxRef.current.sampleRate,
              analyserRef.current.fftSize,
            );
            const noteInfo = frequencyToNote(freq);
            setResult({ frequency: freq, noteName: noteInfo.fullName, cents: noteInfo.cents });
          }
        } else {
          // Signal below noise floor — clear the result so the display shows "listening"
          // rather than the last detected note, giving a clean visual cue to play next note.
          setResult({ frequency: null, noteName: null, cents: null });
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
    setResult({ frequency: null, noteName: null, cents: null });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};