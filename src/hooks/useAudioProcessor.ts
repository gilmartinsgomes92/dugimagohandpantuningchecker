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
  // Cleanup function for the visibilitychange listener that resumes the AudioContext
  // after iOS screen-lock / home-button / tab-switch events suspend it.
  const visibilityCleanupRef = useRef<(() => void) | null>(null);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      // After `await getUserMedia()` the strict user-gesture window may have
      // expired (Chrome resets this on fresh browser start after a restart).
      // Calling resume() here ensures the context is running even in that case.
      // It is a no-op when the context is already in "running" state.
      void audioCtx.resume();
      audioCtxRef.current = audioCtx;

      // iOS Safari suspends the AudioContext when the screen locks or the app is
      // backgrounded.  Re-register a listener on every startListening call so that
      // returning to the app after any interruption automatically resumes it.
      // This listener is passive and never fires on desktop during normal use.
      visibilityCleanupRef.current?.();
      const handleVisibility = () => {
        const ctx = audioCtxRef.current;
        if (!document.hidden && ctx !== null && ctx.state === 'suspended') {
          void ctx.resume();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      // If the AudioContext starts suspended (e.g., after a page refresh with no
      // prior user gesture in this navigation), resume it on the first user
      // interaction. Clicking or touching anywhere — even to navigate to the tuning
      // page — counts as a gesture and unblocks the AudioContext immediately.
      const handleFirstInteraction = () => {
        const ctx = audioCtxRef.current;
        if (ctx !== null && ctx.state === 'suspended') {
          void ctx.resume();
        }
      };
      document.addEventListener('click', handleFirstInteraction, { once: true });
      document.addEventListener('touchstart', handleFirstInteraction, { once: true, passive: true });

      visibilityCleanupRef.current = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      };

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
            }
          }
        } else {
          // Signal below noise floor — clear the result so the display shows "listening"
          // rather than the last detected note, giving a clean visual cue to play next note.
          setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
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
    visibilityCleanupRef.current?.();
    visibilityCleanupRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};