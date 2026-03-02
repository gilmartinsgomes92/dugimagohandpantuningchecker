/**
 * useStrobeTuner – precision multi-partial strobe tuner hook.
 *
 * Wraps `detectPitchInWindow` to measure three independent partials
 * (fundamental, octave, compound-fifth) in real-time using narrow-band
 * FFT pitch detection. Powers Step 2 of the 2-step tuning workflow.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitchInWindow } from '../utils/pitchInWindow';

// ── Stability constants ──────────────────────────────────────────────────────

/** Maximum |cents| deviation for the fundamental to be considered stable. */
export const FUND_TOLERANCE_CENTS = 2;
/** Maximum |cents| deviation for the octave partial to be considered stable. */
export const OCTAVE_TOLERANCE_CENTS = 2;
/** Maximum |cents| deviation for the compound-fifth partial to be considered stable. */
export const COMP_FIFTH_TOLERANCE_CENTS = 5;

/**
 * Number of consecutive frames where all three partials must be within
 * tolerance before `isStable` becomes true (~0.5 s at 60 fps).
 */
export const STABLE_FRAME_THRESHOLD = 30;

// ── Search-window widths (cents either side of target) ───────────────────────

const FUND_WINDOW_CENTS = 20;
const OCTAVE_WINDOW_CENTS = 15;
const COMP_FIFTH_WINDOW_CENTS = 15;

// ── FFT size (must match what AnalyserNode provides) ─────────────────────────

const FFT_SIZE = 4096;

// ── Types ────────────────────────────────────────────────────────────────────

export interface StrobeTunerState {
  /** Detected fundamental frequency in Hz, or null when not detected. */
  frequency: number | null;
  /** Detected octave-partial frequency in Hz, or null when not detected. */
  octaveFrequency: number | null;
  /** Detected compound-fifth-partial frequency in Hz, or null when not detected. */
  compoundFifthFrequency: number | null;
  /** Signed cents deviations from each target. */
  cents: {
    fundamental: number | null;
    octave: number | null;
    compoundFifth: number | null;
  };
  /** True when all three partials have been within tolerance for ≥ STABLE_FRAME_THRESHOLD frames. */
  isStable: boolean;
  /** Number of consecutive stable frames accumulated so far. */
  stabilityFrames: number;
  /** True while audio is actively being captured and processed. */
  isListening: boolean;
  /** Non-null when audio setup encountered an error (e.g. microphone denied). */
  error: string | null;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Returns the signed cents deviation of `detectedFreq` relative to `targetFreq`.
 * Positive = sharp, negative = flat.
 */
export function calcCents(detectedFreq: number, targetFreq: number): number {
  return 1200 * Math.log2(detectedFreq / targetFreq);
}

/**
 * Returns the lower bound of a symmetric search window around `targetFreq`.
 *
 * @param targetFreq - Centre frequency in Hz
 * @param widthCents - Half-width of the window in cents
 */
export function windowLo(targetFreq: number, widthCents: number): number {
  return targetFreq * Math.pow(2, -widthCents / 1200);
}

/**
 * Returns the upper bound of a symmetric search window around `targetFreq`.
 *
 * @param targetFreq - Centre frequency in Hz
 * @param widthCents - Half-width of the window in cents
 */
export function windowHi(targetFreq: number, widthCents: number): number {
  return targetFreq * Math.pow(2, widthCents / 1200);
}

/**
 * Determines whether a set of cents deviations is within the stability
 * thresholds for all three partials.
 */
export function allPartialsStable(
  fundCents: number | null,
  octaveCents: number | null,
  compFifthCents: number | null,
): boolean {
  return (
    fundCents !== null &&
    octaveCents !== null &&
    compFifthCents !== null &&
    Math.abs(fundCents) <= FUND_TOLERANCE_CENTS &&
    Math.abs(octaveCents) <= OCTAVE_TOLERANCE_CENTS &&
    Math.abs(compFifthCents) <= COMP_FIFTH_TOLERANCE_CENTS
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Starts listening to the microphone and returns real-time measurements for
 * three partials of a locked target note.
 *
 * @param targetFundamental  - Target fundamental frequency in Hz (e.g. 146.83 for D3)
 * @param targetOctave       - Target octave frequency in Hz (typically 2× fundamental)
 * @param targetCompoundFifth - Target compound-fifth frequency in Hz (typically 3× fundamental)
 */
export function useStrobeTuner(
  targetFundamental: number,
  targetOctave: number,
  targetCompoundFifth: number,
): StrobeTunerState {
  const [frequency, setFrequency] = useState<number | null>(null);
  const [octaveFrequency, setOctaveFrequency] = useState<number | null>(null);
  const [compoundFifthFrequency, setCompoundFifthFrequency] = useState<number | null>(null);
  const [cents, setCents] = useState<StrobeTunerState['cents']>({
    fundamental: null,
    octave: null,
    compoundFifth: null,
  });
  const [isStable, setIsStable] = useState(false);
  const [stabilityFrames, setStabilityFrames] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio objects and animation frame – avoid re-render on each frame.
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  // Pre-allocated time-domain buffer (reused every frame to avoid GC pressure).
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(FFT_SIZE));
  // Stability frame counter kept in a ref so the RAF closure always reads
  // the latest value without a stale closure over state.
  const stabilityFramesRef = useRef(0);

  const stopListening = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    rafRef.current = null;
    stabilityFramesRef.current = 0;
    setIsListening(false);
    setFrequency(null);
    setOctaveFrequency(null);
    setCompoundFifthFrequency(null);
    setCents({ fundamental: null, octave: null, compoundFifth: null });
    setIsStable(false);
    setStabilityFrames(0);
  }, []);

  // Start listening as soon as the hook mounts.
  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(FFT_SIZE);

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const buf = bufferRef.current;
        const sr = audioCtxRef.current.sampleRate;

        // Narrow-band detection for each partial independently.
        const detectedFund = detectPitchInWindow(
          buf, sr,
          windowLo(targetFundamental, FUND_WINDOW_CENTS),
          windowHi(targetFundamental, FUND_WINDOW_CENTS),
        );
        const detectedOctave = detectPitchInWindow(
          buf, sr,
          windowLo(targetOctave, OCTAVE_WINDOW_CENTS),
          windowHi(targetOctave, OCTAVE_WINDOW_CENTS),
        );
        const detectedCFifth = detectPitchInWindow(
          buf, sr,
          windowLo(targetCompoundFifth, COMP_FIFTH_WINDOW_CENTS),
          windowHi(targetCompoundFifth, COMP_FIFTH_WINDOW_CENTS),
        );

        // Cents deviations from each target.
        const cFund = detectedFund !== null ? calcCents(detectedFund, targetFundamental) : null;
        const cOct = detectedOctave !== null ? calcCents(detectedOctave, targetOctave) : null;
        const cCFifth = detectedCFifth !== null ? calcCents(detectedCFifth, targetCompoundFifth) : null;

        // Stability frame counting.
        const stable = allPartialsStable(cFund, cOct, cCFifth);
        if (stable) {
          stabilityFramesRef.current += 1;
        } else {
          stabilityFramesRef.current = 0;
        }
        const frames = stabilityFramesRef.current;

        setFrequency(detectedFund);
        setOctaveFrequency(detectedOctave);
        setCompoundFifthFrequency(detectedCFifth);
        setCents({ fundamental: cFund, octave: cOct, compoundFifth: cCFifth });
        setStabilityFrames(frames);
        setIsStable(frames >= STABLE_FRAME_THRESHOLD);

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, [targetFundamental, targetOctave, targetCompoundFifth]);

  useEffect(() => {
    startListening();
    return () => { stopListening(); };
  }, [startListening, stopListening]);

  return {
    frequency,
    octaveFrequency,
    compoundFifthFrequency,
    cents,
    isStable,
    stabilityFrames,
    isListening,
    error,
  };
}
