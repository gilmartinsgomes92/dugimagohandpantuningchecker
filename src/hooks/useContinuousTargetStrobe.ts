import { useCallback, useEffect, useRef, useState } from 'react';
import { computeRMS } from '../utils/yin';
import { detectPitchInWindowPhaseDiff } from '../utils/pitchInWindow';

const FFT_SIZE = 8192;
const FUND_WINDOW_CENTS = 140;
const OCTAVE_WINDOW_CENTS = 180;
const COMPOUND_FIFTH_WINDOW_CENTS = 220;
const DISPLAY_CENTS_ALPHA = 0.24;
const FREQ_ALPHA = 0.22;
const SIGNAL_RMS_THRESHOLD = 0.0035;
const EMIT_INTERVAL_MS = 16;
const HOLD_MISSED_FRAMES = 8;

export interface ContinuousTargetPartial {
  frequency: number | null;
  cents: number | null;
  active: boolean;
}

export interface ContinuousTargetStrobeState {
  fundamental: ContinuousTargetPartial;
  octave: ContinuousTargetPartial;
  compoundFifth: ContinuousTargetPartial;
  isListening: boolean;
  signalLevel: number;
  error: string | null;
}

type PartialState = {
  frequency: number | null;
  cents: number | null;
  active: boolean;
};

type PartialMemory = {
  smoothedFreq: number | null;
  smoothedCents: number | null;
  missedFrames: number;
  prevPhase: Float64Array | null;
  currPhase: Float64Array;
};

function calcCents(detectedFreq: number, targetFreq: number): number {
  return 1200 * Math.log2(detectedFreq / targetFreq);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function windowLo(targetFreq: number, widthCents: number): number {
  return targetFreq * Math.pow(2, -widthCents / 1200);
}

function windowHi(targetFreq: number, widthCents: number): number {
  return targetFreq * Math.pow(2, widthCents / 1200);
}

function createPartialMemory(): PartialMemory {
  return {
    smoothedFreq: null,
    smoothedCents: null,
    missedFrames: HOLD_MISSED_FRAMES + 1,
    prevPhase: null,
    currPhase: new Float64Array(FFT_SIZE / 2),
  };
}

function updatePartial(
  memory: PartialMemory,
  buffer: Float32Array,
  sampleRate: number,
  targetFreq: number,
  windowCents: number,
  hopSize: number,
  signalPresent: boolean,
): PartialState {
  const detected = signalPresent
    ? detectPitchInWindowPhaseDiff(
        buffer,
        sampleRate,
        windowLo(targetFreq, windowCents),
        windowHi(targetFreq, windowCents),
        memory.prevPhase,
        memory.currPhase,
        hopSize,
      )
    : null;

  if (detected !== null && Number.isFinite(detected) && detected > 0) {
    if (memory.prevPhase === null) {
      memory.prevPhase = new Float64Array(memory.currPhase);
    } else {
      memory.prevPhase.set(memory.currPhase);
    }

    const nextCents = clamp(calcCents(detected, targetFreq), -windowCents, windowCents);
    memory.smoothedFreq =
      memory.smoothedFreq === null
        ? detected
        : FREQ_ALPHA * detected + (1 - FREQ_ALPHA) * memory.smoothedFreq;
    memory.smoothedCents =
      memory.smoothedCents === null
        ? nextCents
        : DISPLAY_CENTS_ALPHA * nextCents + (1 - DISPLAY_CENTS_ALPHA) * memory.smoothedCents;
    memory.missedFrames = 0;

    return {
      frequency: memory.smoothedFreq,
      cents: memory.smoothedCents,
      active: true,
    };
  }

  memory.prevPhase = null;
  memory.missedFrames += 1;
  if (memory.missedFrames <= HOLD_MISSED_FRAMES && memory.smoothedCents !== null) {
    return {
      frequency: memory.smoothedFreq,
      cents: memory.smoothedCents,
      active: false,
    };
  }

  memory.smoothedFreq = null;
  memory.smoothedCents = null;
  return {
    frequency: null,
    cents: null,
    active: false,
  };
}

export function useContinuousTargetStrobe(
  targetFundamental: number,
  targetOctave: number,
  targetCompoundFifth: number,
): ContinuousTargetStrobeState {
  const [state, setState] = useState<ContinuousTargetStrobeState>({
    fundamental: { frequency: null, cents: null, active: false },
    octave: { frequency: null, cents: null, active: false },
    compoundFifth: { frequency: null, cents: null, active: false },
    isListening: false,
    signalLevel: 0,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const isStartedRef = useRef(false);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(FFT_SIZE * 4)));
  const prevTimeRef = useRef<number | null>(null);
  const lastEmitMsRef = useRef(0);
  const targetFundRef = useRef(targetFundamental);
  const targetOctRef = useRef(targetOctave);
  const targetCFifthRef = useRef(targetCompoundFifth);
  const fundMemoryRef = useRef<PartialMemory>(createPartialMemory());
  const octaveMemoryRef = useRef<PartialMemory>(createPartialMemory());
  const cFifthMemoryRef = useRef<PartialMemory>(createPartialMemory());

  const resetPartials = useCallback(() => {
    fundMemoryRef.current = createPartialMemory();
    octaveMemoryRef.current = createPartialMemory();
    cFifthMemoryRef.current = createPartialMemory();
    prevTimeRef.current = null;
    lastEmitMsRef.current = 0;
  }, []);

  const stopListening = useCallback(() => {
    isStartedRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) void audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());

    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    rafRef.current = null;
    resetPartials();

    setState({
      fundamental: { frequency: null, cents: null, active: false },
      octave: { frequency: null, cents: null, active: false },
      compoundFifth: { frequency: null, cents: null, active: false },
      isListening: false,
      signalLevel: 0,
      error: null,
    });
  }, [resetPartials]);

  const startListening = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    resetPartials();

    try {
      setState((current) => ({ ...current, error: null }));

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

      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.22;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setState((current) => ({ ...current, isListening: true }));

      const tick = () => {
        const analyserNode = analyserRef.current;
        const audioCtx = audioCtxRef.current;
        if (!analyserNode || !audioCtx) return;

        analyserNode.getFloatTimeDomainData(bufferRef.current);
        const buffer = bufferRef.current;
        const sampleRate = audioCtx.sampleRate;
        const nowMs = performance.now();
        const currentTime = audioCtx.currentTime;
        const hopSize = prevTimeRef.current !== null
          ? Math.max(0, Math.round((currentTime - prevTimeRef.current) * sampleRate))
          : 0;
        prevTimeRef.current = currentTime;

        const rms = computeRMS(buffer);
        const signalPresent = rms >= SIGNAL_RMS_THRESHOLD;

        const fundamental = updatePartial(
          fundMemoryRef.current,
          buffer,
          sampleRate,
          targetFundRef.current,
          FUND_WINDOW_CENTS,
          hopSize,
          signalPresent,
        );
        const octave = updatePartial(
          octaveMemoryRef.current,
          buffer,
          sampleRate,
          targetOctRef.current,
          OCTAVE_WINDOW_CENTS,
          hopSize,
          signalPresent,
        );
        const compoundFifth = updatePartial(
          cFifthMemoryRef.current,
          buffer,
          sampleRate,
          targetCFifthRef.current,
          COMPOUND_FIFTH_WINDOW_CENTS,
          hopSize,
          signalPresent,
        );

        if (nowMs - lastEmitMsRef.current >= EMIT_INTERVAL_MS) {
          lastEmitMsRef.current = nowMs;
          setState((current) => ({
            ...current,
            fundamental,
            octave,
            compoundFifth,
            signalLevel: rms,
            isListening: true,
            error: null,
          }));
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      isStartedRef.current = false;
      setState((current) => ({
        ...current,
        error: err instanceof Error ? err.message : 'Microphone access denied',
        isListening: false,
      }));
    }
  }, [resetPartials]);

  useEffect(() => {
    targetFundRef.current = targetFundamental;
    targetOctRef.current = targetOctave;
    targetCFifthRef.current = targetCompoundFifth;
    resetPartials();
    setState((current) => ({
      ...current,
      fundamental: { frequency: null, cents: null, active: false },
      octave: { frequency: null, cents: null, active: false },
      compoundFifth: { frequency: null, cents: null, active: false },
    }));
  }, [targetFundamental, targetOctave, targetCompoundFifth, resetPartials]);

  useEffect(() => {
    void startListening();
    return () => {
      stopListening();
    };
  }, [startListening, stopListening]);

  return state;
}
