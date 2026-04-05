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

const FFT_SIZE = 8192;
const FUNDAMENTAL_WINDOW_CENTS = 140;
const OCTAVE_WINDOW_CENTS = 260;
const COMPOUND_FIFTH_WINDOW_CENTS = 300;
const MIN_SIGNAL_RMS = 0.008;
const MIN_SIGNAL_PEAK = 0.025;
const NOISE_MULTIPLIER = 3.4;
const SILENCE_HOLD_MS = 110;
const FUNDAMENTAL_ALPHA = 0.84;
const PARTIAL_ALPHA = 0.72;
const CONFIDENCE_ON_CENTS = 32;
const MIN_CONFIDENCE_FOR_OUTPUT = 0.12;
const REQUIRED_HIT_STREAK = 2;
const MAX_HIT_DELTA_CENTS = 45;

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

function centerSignal(input: Float32Array, output: Float32Array): { rms: number; peak: number; mean: number } {
  let mean = 0;
  for (let i = 0; i < input.length; i += 1) mean += input[i];
  mean /= input.length;

  let peak = 0;
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i] - mean;
    output[i] = sample;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }

  return { rms: computeRMS(output), peak, mean };
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
  const rawBufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(FFT_SIZE * Float32Array.BYTES_PER_ELEMENT)));
  const workBufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(FFT_SIZE * Float32Array.BYTES_PER_ELEMENT)));

  const prevPhaseFundRef = useRef<Float64Array | null>(null);
  const prevPhaseOctRef = useRef<Float64Array | null>(null);
  const prevPhaseCFifthRef = useRef<Float64Array | null>(null);
  const currPhaseFundRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const currPhaseOctRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const currPhaseCFifthRef = useRef<Float64Array>(new Float64Array(FFT_SIZE / 2));
  const prevAudioTimeRef = useRef<number | null>(null);
  const lastSignalAtRef = useRef<number>(0);
  const noiseFloorRef = useRef<number>(MIN_SIGNAL_RMS * 0.65);
  const hitStreakRef = useRef(0);
  const lastAcceptedFundCentsRef = useRef<number | null>(null);

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
    hitStreakRef.current = 0;
    lastAcceptedFundCentsRef.current = null;
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
    hitStreakRef.current = 0;
    lastAcceptedFundCentsRef.current = null;

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
      analyser.smoothingTimeConstant = 0.05;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
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

        analyserNode.getFloatTimeDomainData(rawBufferRef.current);
        const { rms, peak } = centerSignal(rawBufferRef.current, workBufferRef.current);
        const buffer = workBufferRef.current;
        const sampleRate = audioCtxNode.sampleRate;
        const nowMs = performance.now();

        const hopSize = prevAudioTimeRef.current === null
          ? 0
          : Math.max(0, Math.round((audioCtxNode.currentTime - prevAudioTimeRef.current) * sampleRate));
        prevAudioTimeRef.current = audioCtxNode.currentTime;

        const adaptiveFloor = Math.max(MIN_SIGNAL_RMS, noiseFloorRef.current * NOISE_MULTIPLIER);
        const enoughSignal = rms >= adaptiveFloor && peak >= MIN_SIGNAL_PEAK;

        if (!enoughSignal) {
          noiseFloorRef.current = noiseFloorRef.current * 0.985 + rms * 0.015;
        }

        let detectedFund: number | null = null;
        let detectedOct: number | null = null;
        let detectedCFifth: number | null = null;

        if (enoughSignal) {
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

          const fundCents = detectedFund !== null ? centsDeviation(detectedFund, targetFund) : null;
          const closeToPrevious = fundCents !== null && lastAcceptedFundCentsRef.current !== null
            ? Math.abs(fundCents - lastAcceptedFundCentsRef.current) <= MAX_HIT_DELTA_CENTS
            : true;

          if (fundCents !== null && closeToPrevious) {
            hitStreakRef.current = Math.min(REQUIRED_HIT_STREAK + 2, hitStreakRef.current + 1);
          } else if (fundCents !== null) {
            hitStreakRef.current = 1;
          } else {
            hitStreakRef.current = 0;
          }

          const allowOutput = hitStreakRef.current >= REQUIRED_HIT_STREAK;
          if (allowOutput && fundCents !== null) {
            lastAcceptedFundCentsRef.current = fundCents;
            lastSignalAtRef.current = nowMs;

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
          } else {
            detectedFund = null;
          }
        } else {
          hitStreakRef.current = 0;
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

        const pitchConfidence = fundCents === null
          ? 0
          : clamp(1 - Math.abs(fundCents) / CONFIDENCE_ON_CENTS, 0, 1);
        const amplitudeConfidence = enoughSignal
          ? clamp((rms - adaptiveFloor) / Math.max(0.01, adaptiveFloor * 1.6), 0, 1)
          : 0;
        const confidence = pitchConfidence * 0.78 + amplitudeConfidence * 0.22;

        const shouldShowOutput = keepAlive && confidence >= MIN_CONFIDENCE_FOR_OUTPUT;

        setState((current) => ({
          ...current,
          amplitude: rms,
          confidence: shouldShowOutput ? confidence : 0,
          frequency: shouldShowOutput ? smoothedFundRef.current : null,
          octaveFrequency: shouldShowOutput ? smoothedOctRef.current : null,
          compoundFifthFrequency: shouldShowOutput && compoundFifthEnabledRef.current ? smoothedCFifthRef.current : null,
          cents: {
            fundamental: shouldShowOutput ? fundCents : null,
            octave: shouldShowOutput ? octaveCents : null,
            compoundFifth: shouldShowOutput && compoundFifthEnabledRef.current ? compoundFifthCents : null,
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
