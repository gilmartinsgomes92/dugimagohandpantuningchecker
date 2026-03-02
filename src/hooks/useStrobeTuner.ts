/**
 * useStrobeTuner – precision multi-partial strobe tuner hook.
 *
 * Wraps `detectPitchInWindow` to measure three independent partials
 * (fundamental, octave, compound-fifth) in real-time using narrow-band
 * FFT pitch detection. Powers Step 2 of the 2-step tuning workflow.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitchInWindowPhaseDiff } from '../utils/pitchInWindow';

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

// ── Smoothing / stability-improvement constants ──────────────────────────────

/** EMA decay factor: smoothed = EMA_ALPHA * prev + (1 - EMA_ALPHA) * current.
 *  0.7 keeps ≈70% of the prior estimate, giving a good balance between
 *  responsiveness to genuine pitch shifts and rejection of frame-to-frame noise. */
const EMA_ALPHA = 0.7;
/** Number of consecutive null frames before a smoothed value is cleared. */
const NULL_GRACE_FRAMES = 3;
/** Minimum milliseconds between React state updates (~20 Hz). */
const STATE_UPDATE_INTERVAL_MS = 50;

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
  if (fundCents === null || Math.abs(fundCents) > FUND_TOLERANCE_CENTS) return false;
  if (octaveCents !== null && Math.abs(octaveCents) > OCTAVE_TOLERANCE_CENTS) return false;
  if (compFifthCents !== null && Math.abs(compFifthCents) > COMP_FIFTH_TOLERANCE_CENTS) return false;
  return true;
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
  // Phase spectra for phase-difference correction (one per partial).
  const prevPhaseFundRef = useRef<Float64Array | null>(null);
  const prevPhaseOctRef = useRef<Float64Array | null>(null);
  const prevPhaseCFifthRef = useRef<Float64Array | null>(null);
  // AudioContext.currentTime of the previous tick, used to compute hop size.
  const prevTimeRef = useRef<number | null>(null);
  // Target frequency refs – updated via a sync effect so the tick closure
  // always reads the latest values without needing to be recreated.
  const targetFundRef = useRef(targetFundamental);
  const targetOctRef = useRef(targetOctave);
  const targetCFifthRef = useRef(targetCompoundFifth);
  // Re-entrancy guard: prevents startListening from running concurrently.
  const isStartedRef = useRef(false);
  // EMA-smoothed cents values for stability logic and display.
  const smoothedCentsFundRef = useRef<number | null>(null);
  const smoothedCentsOctRef = useRef<number | null>(null);
  const smoothedCentsCFifthRef = useRef<number | null>(null);
  // EMA-smoothed frequency values for display.
  const smoothedFreqFundRef = useRef<number | null>(null);
  const smoothedFreqOctRef = useRef<number | null>(null);
  const smoothedFreqCFifthRef = useRef<number | null>(null);
  // Consecutive-null frame counters for the grace-window logic.
  const nullCountFundRef = useRef(0);
  const nullCountOctRef = useRef(0);
  const nullCountCFifthRef = useRef(0);
  // Timestamp of the last React state update (used for throttling).
  const lastUpdateTimeRef = useRef<number | null>(null);

  const stopListening = useCallback(() => {
    isStartedRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    rafRef.current = null;
    stabilityFramesRef.current = 0;
    prevPhaseFundRef.current = null;
    prevPhaseOctRef.current = null;
    prevPhaseCFifthRef.current = null;
    prevTimeRef.current = null;
    smoothedCentsFundRef.current = null;
    smoothedCentsOctRef.current = null;
    smoothedCentsCFifthRef.current = null;
    smoothedFreqFundRef.current = null;
    smoothedFreqOctRef.current = null;
    smoothedFreqCFifthRef.current = null;
    nullCountFundRef.current = 0;
    nullCountOctRef.current = 0;
    nullCountCFifthRef.current = 0;
    lastUpdateTimeRef.current = null;
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
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Guard: stopListening may have been called while awaiting getUserMedia.
      if (!isStartedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

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

      // Pre-allocated per-partial phase output arrays (reused every frame).
      const currPhaseFund = new Float64Array(FFT_SIZE / 2);
      const currPhaseOct = new Float64Array(FFT_SIZE / 2);
      const currPhaseCFifth = new Float64Array(FFT_SIZE / 2);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const buf = bufferRef.current;
        const sr = audioCtxRef.current.sampleRate;

        // Compute hop size in samples from the elapsed AudioContext time.
        const currentTime = audioCtxRef.current.currentTime;
        const hopSize = prevTimeRef.current !== null
          ? Math.max(0, Math.round((currentTime - prevTimeRef.current) * sr))
          : 0;
        prevTimeRef.current = currentTime;

        // Read target frequencies from refs so this closure never goes stale.
        const tFund = targetFundRef.current;
        const tOct = targetOctRef.current;
        const tCFifth = targetCFifthRef.current;

        // Narrow-band detection for each partial independently.
        const detectedFund = detectPitchInWindowPhaseDiff(
          buf, sr,
          windowLo(tFund, FUND_WINDOW_CENTS),
          windowHi(tFund, FUND_WINDOW_CENTS),
          prevPhaseFundRef.current,
          currPhaseFund,
          hopSize,
        );
        const detectedOctave = detectPitchInWindowPhaseDiff(
          buf, sr,
          windowLo(tOct, OCTAVE_WINDOW_CENTS),
          windowHi(tOct, OCTAVE_WINDOW_CENTS),
          prevPhaseOctRef.current,
          currPhaseOct,
          hopSize,
        );
        const detectedCFifth = detectPitchInWindowPhaseDiff(
          buf, sr,
          windowLo(tCFifth, COMP_FIFTH_WINDOW_CENTS),
          windowHi(tCFifth, COMP_FIFTH_WINDOW_CENTS),
          prevPhaseCFifthRef.current,
          currPhaseCFifth,
          hopSize,
        );

        // Update phase history: copy current phases to prev refs for next frame.
        // Only update when detection succeeded (non-null); reset on silence so
        // the next non-silent frame falls back to parabolic interpolation.
        if (detectedFund !== null) {
          if (prevPhaseFundRef.current === null) {
            prevPhaseFundRef.current = new Float64Array(currPhaseFund);
          } else {
            prevPhaseFundRef.current.set(currPhaseFund);
          }
        } else {
          prevPhaseFundRef.current = null;
        }
        if (detectedOctave !== null) {
          if (prevPhaseOctRef.current === null) {
            prevPhaseOctRef.current = new Float64Array(currPhaseOct);
          } else {
            prevPhaseOctRef.current.set(currPhaseOct);
          }
        } else {
          prevPhaseOctRef.current = null;
        }
        if (detectedCFifth !== null) {
          if (prevPhaseCFifthRef.current === null) {
            prevPhaseCFifthRef.current = new Float64Array(currPhaseCFifth);
          } else {
            prevPhaseCFifthRef.current.set(currPhaseCFifth);
          }
        } else {
          prevPhaseCFifthRef.current = null;
        }

        // EMA smoothing + null-grace window for each partial.
        // Fundamental
        if (detectedFund !== null) {
          nullCountFundRef.current = 0;
          smoothedFreqFundRef.current = smoothedFreqFundRef.current === null
            ? detectedFund
            : EMA_ALPHA * smoothedFreqFundRef.current + (1 - EMA_ALPHA) * detectedFund;
          const rawCentsFund = calcCents(detectedFund, tFund);
          smoothedCentsFundRef.current = smoothedCentsFundRef.current === null
            ? rawCentsFund
            : EMA_ALPHA * smoothedCentsFundRef.current + (1 - EMA_ALPHA) * rawCentsFund;
        } else {
          nullCountFundRef.current += 1;
          if (nullCountFundRef.current >= NULL_GRACE_FRAMES) {
            smoothedFreqFundRef.current = null;
            smoothedCentsFundRef.current = null;
          }
        }
        // Octave
        if (detectedOctave !== null) {
          nullCountOctRef.current = 0;
          smoothedFreqOctRef.current = smoothedFreqOctRef.current === null
            ? detectedOctave
            : EMA_ALPHA * smoothedFreqOctRef.current + (1 - EMA_ALPHA) * detectedOctave;
          const rawCentsOct = calcCents(detectedOctave, tOct);
          smoothedCentsOctRef.current = smoothedCentsOctRef.current === null
            ? rawCentsOct
            : EMA_ALPHA * smoothedCentsOctRef.current + (1 - EMA_ALPHA) * rawCentsOct;
        } else {
          nullCountOctRef.current += 1;
          if (nullCountOctRef.current >= NULL_GRACE_FRAMES) {
            smoothedFreqOctRef.current = null;
            smoothedCentsOctRef.current = null;
          }
        }
        // Compound fifth
        if (detectedCFifth !== null) {
          nullCountCFifthRef.current = 0;
          smoothedFreqCFifthRef.current = smoothedFreqCFifthRef.current === null
            ? detectedCFifth
            : EMA_ALPHA * smoothedFreqCFifthRef.current + (1 - EMA_ALPHA) * detectedCFifth;
          const rawCentsCFifth = calcCents(detectedCFifth, tCFifth);
          smoothedCentsCFifthRef.current = smoothedCentsCFifthRef.current === null
            ? rawCentsCFifth
            : EMA_ALPHA * smoothedCentsCFifthRef.current + (1 - EMA_ALPHA) * rawCentsCFifth;
        } else {
          nullCountCFifthRef.current += 1;
          if (nullCountCFifthRef.current >= NULL_GRACE_FRAMES) {
            smoothedFreqCFifthRef.current = null;
            smoothedCentsCFifthRef.current = null;
          }
        }

        // Stability frame counting using smoothed values.
        const stable = allPartialsStable(
          smoothedCentsFundRef.current,
          smoothedCentsOctRef.current,
          smoothedCentsCFifthRef.current,
        );
        if (stable) {
          stabilityFramesRef.current += 1;
        } else {
          // Decrement by 2 rather than resetting to 0: a single glitch costs only
          // 2 frames of progress, so brief drop-outs don't erase the accumulated
          // count, yet sustained instability still drives the counter down quickly.
          stabilityFramesRef.current = Math.max(0, stabilityFramesRef.current - 2);
        }
        const frames = stabilityFramesRef.current;
        const isStableNow = frames >= STABLE_FRAME_THRESHOLD;

        // Throttle React state updates to ~20 Hz; always update on lock.
        const now = performance.now();
        const shouldUpdate =
          lastUpdateTimeRef.current === null ||
          (now - lastUpdateTimeRef.current) >= STATE_UPDATE_INTERVAL_MS ||
          isStableNow;
        if (shouldUpdate) {
          lastUpdateTimeRef.current = now;
          setFrequency(smoothedFreqFundRef.current);
          setOctaveFrequency(smoothedFreqOctRef.current);
          setCompoundFifthFrequency(smoothedFreqCFifthRef.current);
          setCents({
            fundamental: smoothedCentsFundRef.current,
            octave: smoothedCentsOctRef.current,
            compoundFifth: smoothedCentsCFifthRef.current,
          });
          setStabilityFrames(frames);
          setIsStable(isStableNow);
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      isStartedRef.current = false;
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  // Keep target frequency refs in sync when the caller's props change,
  // without recreating startListening or restarting the audio pipeline.
  useEffect(() => {
    targetFundRef.current = targetFundamental;
    targetOctRef.current = targetOctave;
    targetCFifthRef.current = targetCompoundFifth;
  }, [targetFundamental, targetOctave, targetCompoundFifth]);

  useEffect(() => {
    startListening();
    return () => { stopListening(); };
  }, []);

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
