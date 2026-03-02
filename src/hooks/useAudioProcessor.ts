import { useState, useRef, useCallback, useEffect } from 'react';
import { computeRMS } from '../utils/yin';
import { findHarmonicFrequency } from '../utils/harmonicAnalyzer';
import { detectPitchInWindow } from '../utils/pitchInWindow';
import { matchNote } from '../utils/spectralMatcher';
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
  // Template match confidence (0–1); higher = more certain note identification.
  matchScore: number;
}

/** Half-width (in cents) of the precision search window for detectPitchInWindow. */
const PRECISION_WINDOW_CENTS = 20;

/**
 * Returns the Hz search bounds for a ±PRECISION_WINDOW_CENTS window around targetFreq.
 */
function precisionWindow(targetFreq: number): { lo: number; hi: number } {
  const ratio = Math.pow(2, PRECISION_WINDOW_CENTS / 1200);
  return { lo: targetFreq / ratio, hi: targetFreq * ratio };
}

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(4096));
  // Frequency-domain buffer for FFT magnitude data (dB), used by spectral matcher
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
          // Stage 1 — Note Identification: spectral template matching against all
          // handpan notes (MIDI 50–84). Scores the entire FFT spectrum against known
          // harmonic templates so that notes where the octave/compound-fifth is louder
          // than the fundamental are still identified correctly.
          const match = matchNote(
            freqBufRef.current,
            audioCtxRef.current.sampleRate,
            analyserRef.current.fftSize,
          );

          if (match !== null) {
            silenceCountRef.current = 0;
            const { nominalFreq, score } = match;
            const sampleRate = audioCtxRef.current.sampleRate;

            // Stage 2 — Precision Measurement: run detectPitchInWindow with tight
            // ±20-cent windows centered on the known ET frequencies. This uses the
            // raw time-domain buffer with a Hann-windowed 4096-point FFT for higher
            // accuracy than the AnalyserNode's pre-computed FFT.
            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            const octaveNominal = nominalFreq * 2;
            const octWin = precisionWindow(octaveNominal);
            const octaveFreq = detectPitchInWindow(buf, sampleRate, octWin.lo, octWin.hi);

            // Fallback: derive fundamental from octave if the fundamental partial is
            // below the noise floor (common on high-octave handpan notes during decay).
            // This is safe because octaveFreq was detected within ±PRECISION_WINDOW_CENTS
            // of nominalFreq × 2, so octaveFreq / 2 is guaranteed to be close to the
            // true fundamental and will map to the correct note via frequencyToNote().
            if (freq === null && octaveFreq !== null) {
              freq = octaveFreq / 2;
            }

            if (freq !== null) {
              const noteInfo = frequencyToNote(freq);

              const compFifthNominal = nominalFreq * 3;
              const cfWin = precisionWindow(compFifthNominal);
              // Use detectPitchInWindow for compound fifth if within the usable FFT range;
              // fall back to findHarmonicFrequency on the AnalyserNode FFT otherwise.
              const compFifthFreq = compFifthNominal <= sampleRate / 2
                ? detectPitchInWindow(buf, sampleRate, cfWin.lo, cfWin.hi)
                : findHarmonicFrequency(
                    freqBufRef.current,
                    compFifthNominal,
                    sampleRate,
                    analyserRef.current.fftSize,
                  );

              setResult({
                frequency: freq,
                octaveFrequency: octaveFreq,
                compoundFifthFrequency: compFifthFreq,
                noteName: noteInfo.fullName,
                cents: noteInfo.cents,
                matchScore: score,
              });
            } else {
              // Template matched but no measurable partial found — count as silent
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
                setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
              }
            }
          } else {
            // No template match above threshold — count as silent/failed frame
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
              setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
            }
          }
        } else {
          // Signal below noise floor — use silence grace to avoid flickering when the
          // note's amplitude decays gradually through the RMS threshold.
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
            setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
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
    setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};