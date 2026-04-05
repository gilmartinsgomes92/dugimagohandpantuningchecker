import { useCallback, useEffect, useRef, useState } from 'react';
import { computeRMS } from '../utils/yin';
import { detectPitchInWindowPhaseDiff } from '../utils/pitchInWindow';

export interface ContinuousTargetStrobeState {
  isListening: boolean;
  error: string | null;
  amplitude: number;
  confidence: number;
  frequency: number | null;
  octaveFrequency: number | null;
  compoundFifthFrequency: number | null;
  cents: {
    fundamental: number | null;
    octave: number | null;
    compoundFifth: number | null;
  };
}

const FFT_SIZE = 16384;
const FUNDAMENTAL_WINDOW_CENTS = 140;
const OCTAVE_WINDOW_CENTS = 260;
const COMPOUND_FIFTH_WINDOW_CENTS = 300;
const SIGNAL_RMS_THRESHOLD = 0.0045;
const SILENCE_HOLD_MS = 130;
const FUNDAMENTAL_ALPHA = 0.72;
const PARTIAL_ALPHA = 0.58;
const CONFIDENCE_ON_CENTS = 45;

function centsDeviation(detectedFreq: number, targetFreq: number): number {
  return 1200 * Math.log2(detectedFreq / targetFreq);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function windowRatio(windowCents: number): number {
  return Math.pow(2, windowCents / 1200);
}

function windowLo(targetFreq: number, widthCents: number): number {
  return targetFreq / windowRatio(widthCents);
}

function windowHi(targetFreq: number, widthCents: number): number {
  return targetFreq * windowRatio(widthCents);
}

function smoothFrequency(previous: number | null, next: number | null, alpha: number): number | null {
  if (next === null) return previous;
  if (previous === null) return next;
  return previous + (next - previous) * alpha;
}

export function useContinuousTargetStrobe(
  targetFundamental: number,
  targetOctave: number,
  targetCompoundFifth: number,
  compoundFifthEnabled: boolean,
): ContinuousTargetStrobeState {
  const [state, setState] = useState<ContinuousTargetStrobeState>({
    isListening: false,
    error: null,
    amplitude: 0,
    confidence: 0,
    frequency: null,
    octaveFrequency: null,
    compoundFifthFrequency: null,
    cents: {
      fundamental: null,
      octave: null,
      compoundFifth: null,
    },
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const isStartedRef = useRef(false);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(FFT_SIZE * 4)));

  const prevPhaseFundRef = useRef<Float64Array | null>(null);
  const prevPhaseOctRef = useRef<Float64Array | null>(null);
  const prevPhaseCFifthRef = useRef<Float64Array | null>(null);
  const currPhaseFundRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const currPhaseOctRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const currPhaseCFifthRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const prevAudioTimeRef = useRef<number | null>(null);
  const lastSignalAtRef = useRef<number>(0);

  const smoothedFundRef = useRef<number | null>(null);
  const smoothedOctRef = useRef<number | null>(null);
  const smoothedCFifthRef = useRef<number | null>(null);

  const targetFundRef = useRef(targetFundamental);
  const targetOctRef = useRef(targetOctave);
  const targetCFifthRef = useRef(targetCompoundFifth);
  const compoundFifthEnabledRef = useRef(compoundFifthEnabled);

  useEffect(() => {
    targetFundRef.current = targetFundamental;
    targetOctRef.current = targetOctave;
    targetCFifthRef.current = targetCompoundFifth;
    compoundFifthEnabledRef.current = compoundFifthEnabled;
    smoothedFundRef.current = null;
    smoothedOctRef.current = null;
    smoothedCFifthRef.current = null;
    prevPhaseFundRef.current = null;
    prevPhaseOctRef.current = null;
    prevPhaseCFifthRef.current = null;
    prevAudioTimeRef.current = null;
    setState((current) => ({
      ...current,
      frequency: null,
      octaveFrequency: null,
      compoundFifthFrequency: null,
      confidence: 0,
      cents: {
        fundamental: null,
        octave: null,
        compoundFifth: null,
      },
    }));
  }, [targetFundamental, targetOctave, targetCompoundFifth, compoundFifthEnabled]);

  const stop = useCallback(() => {
    isStartedRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;

    prevPhaseFundRef.current = null;
    prevPhaseOctRef.current = null;
    prevPhaseCFifthRef.current = null;
    prevAudioTimeRef.current = null;
    smoothedFundRef.current = null;
    smoothedOctRef.current = null;
    smoothedCFifthRef.current = null;

    setState((current) => ({
      ...current,
      isListening: false,
      amplitude: 0,
      confidence: 0,
      frequency: null,
      octaveFrequency: null,
      compoundFifthFrequency: null,
      cents: { fundamental: null, octave: null, compoundFifth: null },
    }));
  }, []);

  const start = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;

    try {
      setState((current) => ({ ...current, error: null }));

      const audioCtx = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.15;
      analyserRef.current = analyser;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });

      if (!isStartedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      setState((current) => ({ ...current, isListening: true }));

      const tick = () => {
        const analyserNode = analyserRef.current;
        const audioCtxNode = audioCtxRef.current;
        if (!analyserNode || !audioCtxNode) return;

        analyserNode.getFloatTimeDomainData(bufferRef.current);
        const buffer = bufferRef.current;
        const sampleRate = audioCtxNode.sampleRate;
        const amplitude = computeRMS(buffer);
        const nowMs = performance.now();

        const hopSize = prevAudioTimeRef.current === null
          ? 0
          : Math.max(0, Math.round((audioCtxNode.currentTime - prevAudioTimeRef.current) * sampleRate));
        prevAudioTimeRef.current = audioCtxNode.currentTime;

        let detectedFund: number | null = null;
        let detectedOct: number | null = null;
        let detectedCFifth: number | null = null;

        if (amplitude >= SIGNAL_RMS_THRESHOLD) {
          lastSignalAtRef.current = nowMs;

          const targetFund = targetFundRef.current;
          const targetOct = targetOctRef.current;
          const targetCFifth = targetCFifthRef.current;

          detectedFund = detectPitchInWindowPhaseDiff(
            buffer,
            sampleRate,
            windowLo(targetFund, FUNDAMENTAL_WINDOW_CENTS),
            windowHi(targetFund, FUNDAMENTAL_WINDOW_CENTS),
            prevPhaseFundRef.current,
            currPhaseFundRef.current,
            hopSize,
          );

          detectedOct = detectPitchInWindowPhaseDiff(
            buffer,
            sampleRate,
            windowLo(targetOct, OCTAVE_WINDOW_CENTS),
            windowHi(targetOct, OCTAVE_WINDOW_CENTS),
            prevPhaseOctRef.current,
            currPhaseOctRef.current,
            hopSize,
          );

          if (compoundFifthEnabledRef.current) {
            detectedCFifth = detectPitchInWindowPhaseDiff(
              buffer,
              sampleRate,
              windowLo(targetCFifth, COMPOUND_FIFTH_WINDOW_CENTS),
              windowHi(targetCFifth, COMPOUND_FIFTH_WINDOW_CENTS),
              prevPhaseCFifthRef.current,
              currPhaseCFifthRef.current,
              hopSize,
            );
          }
        }

        if (detectedFund !== null) {
          if (prevPhaseFundRef.current === null) prevPhaseFundRef.current = new Float64Array(currPhaseFundRef.current);
          else prevPhaseFundRef.current.set(currPhaseFundRef.current);
        } else {
          prevPhaseFundRef.current = null;
        }

        if (detectedOct !== null) {
          if (prevPhaseOctRef.current === null) prevPhaseOctRef.current = new Float64Array(currPhaseOctRef.current);
          else prevPhaseOctRef.current.set(currPhaseOctRef.current);
        } else {
          prevPhaseOctRef.current = null;
        }

        if (detectedCFifth !== null) {
          if (prevPhaseCFifthRef.current === null) prevPhaseCFifthRef.current = new Float64Array(currPhaseCFifthRef.current);
          else prevPhaseCFifthRef.current.set(currPhaseCFifthRef.current);
        } else {
          prevPhaseCFifthRef.current = null;
        }

        const keepAlive = nowMs - lastSignalAtRef.current <= SILENCE_HOLD_MS;

        smoothedFundRef.current = keepAlive
          ? smoothFrequency(smoothedFundRef.current, detectedFund, FUNDAMENTAL_ALPHA)
          : null;
        smoothedOctRef.current = keepAlive
          ? smoothFrequency(smoothedOctRef.current, detectedOct, PARTIAL_ALPHA)
          : null;
        smoothedCFifthRef.current = keepAlive && compoundFifthEnabledRef.current
          ? smoothFrequency(smoothedCFifthRef.current, detectedCFifth, PARTIAL_ALPHA)
          : null;

        const fundCents = smoothedFundRef.current !== null
          ? centsDeviation(smoothedFundRef.current, targetFundRef.current)
          : null;
        const octaveCents = smoothedOctRef.current !== null
          ? centsDeviation(smoothedOctRef.current, targetOctRef.current)
          : null;
        const compoundFifthCents = smoothedCFifthRef.current !== null && compoundFifthEnabledRef.current
          ? centsDeviation(smoothedCFifthRef.current, targetCFifthRef.current)
          : null;

        const confidence = fundCents === null || amplitude < SIGNAL_RMS_THRESHOLD
          ? 0
          : clamp(1 - Math.abs(fundCents) / CONFIDENCE_ON_CENTS, 0, 1);

        setState((current) => ({
          ...current,
          amplitude,
          confidence,
          frequency: smoothedFundRef.current,
          octaveFrequency: smoothedOctRef.current,
          compoundFifthFrequency: compoundFifthEnabledRef.current ? smoothedCFifthRef.current : null,
          cents: {
            fundamental: fundCents,
            octave: octaveCents,
            compoundFifth: compoundFifthEnabledRef.current ? compoundFifthCents : null,
          },
        }));

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to access microphone';
      setState((current) => ({ ...current, error: message, isListening: false }));
      stop();
    }
  }, [stop]);

  useEffect(() => {
    void start();
    return () => {
      stop();
    };
  }, [start, stop]);

  return state;
}
