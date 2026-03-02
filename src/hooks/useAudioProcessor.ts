import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { validateFundamental, findHarmonicFrequency } from '../utils/harmonicAnalyzer';
import { frequencyToNote } from '../utils/musicUtils';

interface AudioResult {
  frequency: number | null;
  // Independently measured 2nd partial (physical octave) — may differ from 2×frequency
  // on real handpans due to inharmonicity in the metal geometry.
  octaveFrequency: number | null;
  // Independently measured 3rd partial (compound fifth) — may differ from 3×frequency.
  compoundFifthFrequency: number | null;
  noteName: string | null;
  cents: number | null;
}

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096));
  // Frequency-domain buffer for FFT magnitude data (dB), used by validateFundamental
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  // Re-entrancy guard: prevents duplicate audio streams from concurrent startListening calls
  const isStartedRef = useRef(false);
  // Consecutive silent/failed frames counter for silence grace logic
  const silenceCountRef = useRef(0);

  // Number of consecutive below-threshold frames before clearing the result to null.
  // Prevents flicker when a handpan note's amplitude gradually decays through the RMS
  // threshold, causing the display to oscillate between the note and "Listening…".
  const SILENCE_GRACE_FRAMES = 5;

  const startListening = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    silenceCountRef.current = 0;
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!isStartedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
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
            // null means validateFundamental rejected this frame (no harmonic family
            // found). Silently skip the setResult call so the stability counter in
            // QuickTuningPage does not see this false pick — the display and the counter
            // both stay at their current values, and the next valid frame updates them.
            if (freq !== null) {
              silenceCountRef.current = 0;
              const noteInfo = frequencyToNote(freq);
              // Independently measure the 2nd and 3rd physical partials using the FFT.
              // Real handpan partials deviate from exact 2:1 and 3:1 ratios due to
              // the metal geometry (inharmonicity), so measuring each partial directly
              // gives more accurate per-partial readings than multiplying the fundamental.
              const octaveFreq = findHarmonicFrequency(
                freqBufRef.current, freq * 2,
                audioCtxRef.current.sampleRate, analyserRef.current.fftSize,
              );
              const compFifthFreq = findHarmonicFrequency(
                freqBufRef.current, freq * 3,
                audioCtxRef.current.sampleRate, analyserRef.current.fftSize,
              );
              setResult({
                frequency: freq,
                octaveFrequency: octaveFreq,
                compoundFifthFrequency: compFifthFreq,
                noteName: noteInfo.fullName,
                cents: noteInfo.cents,
              });
            } else {
              // validateFundamental rejected this frame — count as a silent/failed frame
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
                setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
              }
            }
          } else {
            // YIN found no pitch — count as a silent/failed frame
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
              setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
            }
          }
        } else {
          // Signal below noise floor — use silence grace to avoid flickering when the
          // note's amplitude decays gradually through the RMS threshold.
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
            setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      isStartedRef.current = false;
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  const stopListening = useCallback(() => {
    isStartedRef.current = false;
    silenceCountRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};