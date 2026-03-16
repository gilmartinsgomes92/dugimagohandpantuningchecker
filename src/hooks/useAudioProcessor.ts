import { useState, useRef, useCallback, useEffect } from 'react';
import { computeRMS } from '../utils/yin';
import { detectPitchInWindow } from '../utils/pitchInWindow';
import { matchNote } from '../utils/spectralMatcher';
import { robustPartialMean } from '../utils/musicUtils';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

interface AudioResult {
  frequency: number | null;
  octaveFrequency: number | null;
  octaveDiagnosticFrequency: number | null;
  compoundFifthFrequency: number | null;
  compoundFifthDiagnosticFrequency: number | null;
  noteName: string | null;
  cents: number | null;
  matchScore: number;
  lockQuality: number;
}

export type DebugInfo = {
  audioState: string;
  rms: number;
  rmsPeak: number;
  noiseFloor: number;
  waitingStabilization: boolean;
  matchScore: number;
  noteName: string | null;
  rawFreq: number | null;
  smoothedFreq: number | null;
  rejectReason: string;
};

/** Half-width (in cents) of the precision search window for detectPitchInWindow. */
const PRECISION_WINDOW_CENTS = 40;

/** Wider fallback measurement window used only when the strict window misses a very detuned note. */
const FALLBACK_PRECISION_WINDOW_CENTS = 85;

/** Diagnostic half-width used only when the normal octave / fifth measurements are missing. */
const PARTIAL_DIAGNOSTIC_WINDOW_CENTS = 650;

/** Minimum deviation required before a diagnostic partial is considered a real extreme displacement. */
const PARTIAL_DIAGNOSTIC_EXTREME_MIN_CENTS = 100;

/** EMA smoothing factor for frequency output (0–1). Lower = more smoothing. */
const FREQ_SMOOTH_ALPHA = 0.15;

/**
 * Maximum cents jump allowed between consecutive smoothed readings.
 * Frames where the raw frequency jumps more than this from the smoothed value
 * are treated as spectral glitches and skipped entirely.
 */
const MAX_CENTS_JUMP = 45;

function precisionWindow(
  targetFreq: number,
  halfWidthCents: number = PRECISION_WINDOW_CENTS,
): { lo: number; hi: number } {
  const ratio = Math.pow(2, halfWidthCents / 1200);
  return { lo: targetFreq / ratio, hi: targetFreq * ratio };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToFullName(midiNote: number): string {
  const name = NOTE_NAMES[((midiNote % 12) + 12) % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${name}${octave}`;
}

function centsFromNominal(freqHz: number, nominalHz: number): number {
  return 1200 * Math.log2(freqHz / nominalHz);
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

const DEBUG_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const IS_IOS =
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const SILENCE_GRACE_FRAMES = 5;

// Main audio gate (keeps CPU down)
const SIGNAL_RMS_THRESHOLD = IS_IOS ? 0.003 : 0.005;

// UI / cents behavior
const EMIT_INTERVAL_MS = 70; // ~14 Hz
const CENTS_SMOOTH_ALPHA = 0.18;

/** Strike-window parameters for lock + refine behaviour. */
const IGNORE_AFTER_STRIKE_MS = 140;
const LOCK_WINDOW_MS = 320;
const REFINE_WINDOW_MS = 1100;
const TOTAL_OBSERVATION_MS = IGNORE_AFTER_STRIKE_MS + LOCK_WINDOW_MS + REFINE_WINDOW_MS;
const MIN_LOCK_WINDOW_FRAMES = 6;
const MAX_WINDOW_FRAMES = 28;

/** Wider harmonic search windows for real-world handpan inharmonicity. */
const OCTAVE_MIN_RATIO = 1.85;
const OCTAVE_MAX_RATIO = 2.15;
const FIFTH_MIN_RATIO = 2.7;
const FIFTH_MAX_RATIO = 3.3;

const SPECTRAL_PEAK_MIN_DB = -78;

type WindowFrame = { freq: number; cents: number; quality: number };

type HarmonicSample = {
  frequency: number;
  amplitude: number;
};

type HarmonicBucket = {
  frequency: number[];
  amplitude: number[];
  count: number;
};

function createBucket(): HarmonicBucket {
  return { frequency: [], amplitude: [], count: 0 };
}

function resetBucket(bucket: HarmonicBucket): void {
  bucket.frequency = [];
  bucket.amplitude = [];
  bucket.count = 0;
}

function addToBucket(bucket: HarmonicBucket, sample: HarmonicSample | null): void {
  if (!sample) return;
  bucket.frequency.push(sample.frequency);
  bucket.amplitude.push(sample.amplitude);
  bucket.count += 1;
}

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mad(nums: number[], med: number): number {
  const dev = nums.map((v) => Math.abs(v - med));
  return median(dev);
}

function finalizeBucket(bucket: HarmonicBucket): number | null {
  if (bucket.count === 0 || bucket.frequency.length === 0) return null;

  const ranked = bucket.frequency.map((frequency, index) => ({
    frequency,
    amplitude: bucket.amplitude[index] ?? -Infinity,
  }));

  ranked.sort((a, b) => b.amplitude - a.amplitude);

  const keepCount = Math.max(1, Math.ceil(ranked.length * 0.5));
  const strongestFrequencies = ranked.slice(0, keepCount).map((item) => item.frequency);

  return robustPartialMean(strongestFrequencies);
}

function interpolatePeakFrequency(
  freqData: Float32Array,
  peakBin: number,
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  const prevMag = freqData[peakBin - 1] ?? freqData[peakBin];
  const peakMag = freqData[peakBin];
  const nextMag = freqData[peakBin + 1] ?? freqData[peakBin];

  const denom = 2 * peakMag - prevMag - nextMag;
  let delta = 0;
  if (Math.abs(denom) > 1e-6) {
    delta = 0.5 * (nextMag - prevMag) / denom;
    delta = clamp(delta, -0.5, 0.5);
  }

  return (peakBin + delta) * binHz;
}

function findStrongestSpectralPeakInRange(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  minFreq: number,
  maxFreq: number,
): HarmonicSample | null {
  if (minFreq <= 0 || maxFreq <= minFreq) return null;

  const binHz = sampleRate / fftSize;
  const lowBin = Math.max(1, Math.floor(minFreq / binHz));
  const highBin = Math.min(freqData.length - 2, Math.ceil(maxFreq / binHz));

  if (lowBin >= highBin) return null;

  let bestBin = -1;
  let bestMag = -Infinity;

  for (let bin = lowBin; bin <= highBin; bin += 1) {
    const mag = freqData[bin];
    if (
      mag > bestMag &&
      mag >= SPECTRAL_PEAK_MIN_DB &&
      mag >= freqData[bin - 1] &&
      mag >= freqData[bin + 1]
    ) {
      bestMag = mag;
      bestBin = bin;
    }
  }

  if (bestBin < 0 || bestMag < SPECTRAL_PEAK_MIN_DB) return null;

  return {
    frequency: interpolatePeakFrequency(freqData, bestBin, sampleRate, fftSize),
    amplitude: bestMag,
  };
}

function getBucketPartial(
  bucket: HarmonicBucket,
  diagnosticValue: number | null,
): { measured: number | null; diagnostic: number | null } {
  const measured = finalizeBucket(bucket);
  return {
    measured,
    diagnostic: measured ?? diagnosticValue,
  };
}

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({
    frequency: null,
    octaveFrequency: null,
    octaveDiagnosticFrequency: null,
    compoundFifthFrequency: null,
    compoundFifthDiagnosticFrequency: null,
    noteName: null,
    cents: null,
    matchScore: 0,
    lockQuality: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    audioState: 'idle',
    rms: 0,
    rmsPeak: 0,
    noiseFloor: 0,
    waitingStabilization: false,
    matchScore: 0,
    noteName: null,
    rawFreq: null,
    smoothedFreq: null,
    rejectReason: '',
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(8192 * 4)));
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(4096 * 4)));

  const isStartedRef = useRef(false);
  const silenceCountRef = useRef(0);

  const smoothedFreqRef = useRef<number | null>(null);
  const smoothedMidiRef = useRef<number | null>(null);
  const smoothedOctaveRef = useRef<number | null>(null);
  const smoothedOctaveDiagnosticRef = useRef<number | null>(null);
  const smoothedCFifthRef = useRef<number | null>(null);
  const smoothedCFifthDiagnosticRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number | null>(null);
  const noteOnsetMsRef = useRef<number>(0);
  const strikeAtMsRef = useRef<number>(0);
  const windowFramesRef = useRef<WindowFrame[]>([]);
  const lastLockQualityRef = useRef<number>(0);
  const lastEmitMsRef = useRef<number>(0);
  const uiUnlockedRef = useRef<boolean>(false);
  const refineEndMsRef = useRef<number>(0);
  const octaveBucketRef = useRef<HarmonicBucket>(createBucket());
  const fifthBucketRef = useRef<HarmonicBucket>(createBucket());

  const rmsPeakRef = useRef(0);
  const noiseFloorRef = useRef(0.002);
  const rejectReasonRef = useRef('');
  const lastMatchScoreRef = useRef(0);
  const lastNoteNameRef = useRef<string | null>(null);
  const lastRawFreqRef = useRef<number | null>(null);

  const waitingForStabilizationRef = useRef<boolean>(false);

  const resetState = useCallback(() => {
    silenceCountRef.current = 0;
    smoothedFreqRef.current = null;
    smoothedMidiRef.current = null;
    smoothedOctaveRef.current = null;
    smoothedOctaveDiagnosticRef.current = null;
    smoothedCFifthRef.current = null;
    smoothedCFifthDiagnosticRef.current = null;
    smoothedCentsRef.current = null;
    noteOnsetMsRef.current = 0;
    lastEmitMsRef.current = 0;
    uiUnlockedRef.current = false;
    refineEndMsRef.current = 0;

    rmsPeakRef.current = 0;
    noiseFloorRef.current = 0.002;
    rejectReasonRef.current = '';
    lastMatchScoreRef.current = 0;
    lastNoteNameRef.current = null;
    lastRawFreqRef.current = null;

    strikeAtMsRef.current = 0;
    windowFramesRef.current = [];
    lastLockQualityRef.current = 0;
    resetBucket(octaveBucketRef.current);
    resetBucket(fifthBucketRef.current);

    waitingForStabilizationRef.current = false;
  }, []);

  const emitResult = useCallback((payload: {
    frequency: number;
    octaveFrequency: number | null;
    octaveDiagnosticFrequency: number | null;
    compoundFifthFrequency: number | null;
    compoundFifthDiagnosticFrequency: number | null;
    noteName: string;
    cents: number | null;
    matchScore: number;
    lockQuality: number;
  }) => {
    smoothedOctaveRef.current =
      payload.octaveFrequency === null
        ? smoothedOctaveRef.current
        : smoothedOctaveRef.current === null
          ? payload.octaveFrequency
          : FREQ_SMOOTH_ALPHA * payload.octaveFrequency +
            (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveRef.current;

    smoothedOctaveDiagnosticRef.current =
      payload.octaveDiagnosticFrequency === null
        ? smoothedOctaveDiagnosticRef.current
        : smoothedOctaveDiagnosticRef.current === null
          ? payload.octaveDiagnosticFrequency
          : FREQ_SMOOTH_ALPHA * payload.octaveDiagnosticFrequency +
            (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveDiagnosticRef.current;

    smoothedCFifthRef.current =
      payload.compoundFifthFrequency === null
        ? smoothedCFifthRef.current
        : smoothedCFifthRef.current === null
          ? payload.compoundFifthFrequency
          : FREQ_SMOOTH_ALPHA * payload.compoundFifthFrequency +
            (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthRef.current;

    smoothedCFifthDiagnosticRef.current =
      payload.compoundFifthDiagnosticFrequency === null
        ? smoothedCFifthDiagnosticRef.current
        : smoothedCFifthDiagnosticRef.current === null
          ? payload.compoundFifthDiagnosticFrequency
          : FREQ_SMOOTH_ALPHA * payload.compoundFifthDiagnosticFrequency +
            (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthDiagnosticRef.current;

    setResult({
      frequency: payload.frequency,
      octaveFrequency: smoothedOctaveRef.current,
      octaveDiagnosticFrequency: smoothedOctaveDiagnosticRef.current,
      compoundFifthFrequency: smoothedCFifthRef.current,
      compoundFifthDiagnosticFrequency: smoothedCFifthDiagnosticRef.current,
      noteName: payload.noteName,
      cents: payload.cents,
      matchScore: payload.matchScore,
      lockQuality: payload.lockQuality,
    });
  }, []);

  const startListening = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    resetState();

    try {
      setError(null);

      const audioWindow = window as WebkitWindow;
      const AudioCtx = audioWindow.AudioContext || audioWindow.webkitAudioContext;

      if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this browser');
      }

      const audioCtx = new AudioCtx({ latencyHint: 'interactive' });
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      freqBufRef.current = new Float32Array(new ArrayBuffer((analyser.fftSize / 2) * 4));

      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      analyser.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);

      const osc = audioCtx.createOscillator();
      osc.frequency.value = 440;
      osc.connect(zeroGain);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.01);

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
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        const buf = bufferRef.current;
        analyserRef.current.getFloatTimeDomainData(buf);
        analyserRef.current.getFloatFrequencyData(freqBufRef.current);

        const rms = computeRMS(buf);
        rmsPeakRef.current = Math.max(rmsPeakRef.current * 0.96, rms);
        if (rms < 0.004) {
          noiseFloorRef.current = 0.98 * noiseFloorRef.current + 0.02 * rms;
        }

        rejectReasonRef.current = '';

        const dynamicGate = Math.max(
          SIGNAL_RMS_THRESHOLD,
          noiseFloorRef.current * 6 + 0.0005,
        );

        if (rms >= dynamicGate) {
          const match = matchNote(
            freqBufRef.current,
            audioCtxRef.current.sampleRate,
            analyserRef.current.fftSize,
          );

          if (match !== null) {
            silenceCountRef.current = 0;
            const { midiNote, nominalFreq, score } = match;
            const sampleRate = audioCtxRef.current.sampleRate;
            const nowMs = performance.now();

            lastMatchScoreRef.current = score;
            lastNoteNameRef.current = midiToFullName(midiNote);

            const noteChanged = smoothedMidiRef.current !== null && smoothedMidiRef.current !== midiNote;
            const observationExpired =
              uiUnlockedRef.current &&
              refineEndMsRef.current > 0 &&
              nowMs > refineEndMsRef.current;

            if (noteChanged || observationExpired) {
              smoothedFreqRef.current = null;
              smoothedOctaveRef.current = null;
              smoothedOctaveDiagnosticRef.current = null;
              smoothedCFifthRef.current = null;
              smoothedCFifthDiagnosticRef.current = null;
              smoothedCentsRef.current = null;
              noteOnsetMsRef.current = nowMs;
              strikeAtMsRef.current = nowMs;
              windowFramesRef.current = [];
              lastLockQualityRef.current = 0;
              lastEmitMsRef.current = 0;
              uiUnlockedRef.current = false;
              refineEndMsRef.current = 0;
              resetBucket(octaveBucketRef.current);
              resetBucket(fifthBucketRef.current);
            }

            smoothedMidiRef.current = midiNote;
            if (noteOnsetMsRef.current === 0) {
              noteOnsetMsRef.current = nowMs;
              strikeAtMsRef.current = nowMs;
              windowFramesRef.current = [];
              lastLockQualityRef.current = 0;
              uiUnlockedRef.current = false;
              refineEndMsRef.current = 0;
              resetBucket(octaveBucketRef.current);
              resetBucket(fifthBucketRef.current);
            }

            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            if (freq === null) {
              const wideFundWin = precisionWindow(nominalFreq, FALLBACK_PRECISION_WINDOW_CENTS);
              freq = detectPitchInWindow(buf, sampleRate, wideFundWin.lo, wideFundWin.hi);
            }

            lastRawFreqRef.current = freq;

            if (freq === null) {
              rejectReasonRef.current = 'freq null';
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
                resetState();
                setResult({
                  frequency: null,
                  octaveFrequency: null,
                  octaveDiagnosticFrequency: null,
                  compoundFifthFrequency: null,
                  compoundFifthDiagnosticFrequency: null,
                  noteName: null,
                  cents: null,
                  matchScore: 0,
                  lockQuality: 0,
                });
              }

              if (DEBUG_ENABLED) {
                setDebugInfo({
                  audioState: audioCtxRef.current?.state ?? 'none',
                  rms,
                  rmsPeak: rmsPeakRef.current,
                  noiseFloor: noiseFloorRef.current,
                  waitingStabilization: waitingForStabilizationRef.current,
                  matchScore: lastMatchScoreRef.current,
                  noteName: lastNoteNameRef.current,
                  rawFreq: lastRawFreqRef.current,
                  smoothedFreq: smoothedFreqRef.current,
                  rejectReason: rejectReasonRef.current,
                });
              }

              rafRef.current = requestAnimationFrame(tick);
              return;
            }

            const dt = nowMs - strikeAtMsRef.current;
            const inObservationWindow =
              dt >= IGNORE_AFTER_STRIKE_MS && dt <= TOTAL_OBSERVATION_MS;
            const inLockWindow =
              dt >= IGNORE_AFTER_STRIKE_MS &&
              dt <= IGNORE_AFTER_STRIKE_MS + LOCK_WINDOW_MS;

            if (inObservationWindow) {
              const cents = clamp(centsFromNominal(freq, nominalFreq), -60, 60);

              if (inLockWindow) {
                windowFramesRef.current.push({ freq, cents, quality: score });
                if (windowFramesRef.current.length > MAX_WINDOW_FRAMES) {
                  windowFramesRef.current.shift();
                }
              }

              const octavePeak = findStrongestSpectralPeakInRange(
                freqBufRef.current,
                sampleRate,
                analyserRef.current.fftSize,
                nominalFreq * OCTAVE_MIN_RATIO,
                nominalFreq * OCTAVE_MAX_RATIO,
              );

              const fifthPeak = findStrongestSpectralPeakInRange(
                freqBufRef.current,
                sampleRate,
                analyserRef.current.fftSize,
                nominalFreq * FIFTH_MIN_RATIO,
                nominalFreq * FIFTH_MAX_RATIO,
              );

              addToBucket(octaveBucketRef.current, octavePeak);
              addToBucket(fifthBucketRef.current, fifthPeak);
            }

            let lockedFreq: number | null = null;

            if (windowFramesRef.current.length >= MIN_LOCK_WINDOW_FRAMES) {
              const frames = windowFramesRef.current;
              const freqs = frames.map((frame) => frame.freq);
              const centsArr = frames.map((frame) => frame.cents);
              const quals = frames.map((frame) => frame.quality);

              const freqMed = median(freqs);
              const centsMed = median(centsArr);
              const qMed = median(quals);
              const centsMad = mad(centsArr, centsMed);
              const stability = clamp((6 - centsMad) / (6 - 1.5), 0, 1);
              const lockQuality = clamp(0.55 * qMed + 0.45 * stability, 0, 1);

              lastLockQualityRef.current = lockQuality;
              if (lockQuality >= 0.55) {
                lockedFreq = freqMed;
              }
            } else {
              lastLockQualityRef.current = Math.max(0, lastLockQualityRef.current - 0.04);
            }

            if (lockedFreq === null) {
              rejectReasonRef.current = 'collecting lock window';
              if (DEBUG_ENABLED) {
                setDebugInfo({
                  audioState: audioCtxRef.current?.state ?? 'none',
                  rms,
                  rmsPeak: rmsPeakRef.current,
                  noiseFloor: noiseFloorRef.current,
                  waitingStabilization: false,
                  matchScore: lastMatchScoreRef.current,
                  noteName: lastNoteNameRef.current,
                  rawFreq: lastRawFreqRef.current,
                  smoothedFreq: smoothedFreqRef.current,
                  rejectReason: rejectReasonRef.current,
                });
              }
              rafRef.current = requestAnimationFrame(tick);
              return;
            }

            freq = lockedFreq;

            if (smoothedFreqRef.current !== null) {
              const centsJump = Math.abs(1200 * Math.log2(freq / smoothedFreqRef.current));
              if (centsJump > MAX_CENTS_JUMP) {
                rejectReasonRef.current = 'jump rejected';
                if (DEBUG_ENABLED) {
                  setDebugInfo({
                    audioState: audioCtxRef.current?.state ?? 'none',
                    rms,
                    rmsPeak: rmsPeakRef.current,
                    noiseFloor: noiseFloorRef.current,
                    waitingStabilization: false,
                    matchScore: lastMatchScoreRef.current,
                    noteName: lastNoteNameRef.current,
                    rawFreq: lastRawFreqRef.current,
                    smoothedFreq: smoothedFreqRef.current,
                    rejectReason: rejectReasonRef.current,
                  });
                }
                rafRef.current = requestAnimationFrame(tick);
                return;
              }
            }

            smoothedFreqRef.current =
              smoothedFreqRef.current === null
                ? freq
                : FREQ_SMOOTH_ALPHA * freq + (1 - FREQ_SMOOTH_ALPHA) * smoothedFreqRef.current;

            const smoothedFreq = smoothedFreqRef.current;
            const noteName = midiToFullName(midiNote);
            const rawCents = clamp(centsFromNominal(smoothedFreq, nominalFreq), -60, 60);

            smoothedCentsRef.current =
              smoothedCentsRef.current === null
                ? rawCents
                : CENTS_SMOOTH_ALPHA * rawCents + (1 - CENTS_SMOOTH_ALPHA) * smoothedCentsRef.current;

            if (!uiUnlockedRef.current && dt >= IGNORE_AFTER_STRIKE_MS + LOCK_WINDOW_MS) {
              uiUnlockedRef.current = true;
              refineEndMsRef.current = nowMs + REFINE_WINDOW_MS;
            }

            const targetOctave = nominalFreq * 2;
            const targetFifth = nominalFreq * 3;
            let diagnosticOctaveFreq: number | null = null;
            let diagnosticCFifthFreq: number | null = null;

            const octaveMeasured = finalizeBucket(octaveBucketRef.current);
            if (octaveMeasured === null) {
              const diagnosticOctWin = precisionWindow(targetOctave, PARTIAL_DIAGNOSTIC_WINDOW_CENTS);
              const rawDiagnosticOctave = detectPitchInWindow(
                buf,
                sampleRate,
                diagnosticOctWin.lo,
                diagnosticOctWin.hi,
              );
              diagnosticOctaveFreq =
                rawDiagnosticOctave !== null &&
                Math.abs(centsFromNominal(rawDiagnosticOctave, targetOctave)) >=
                  PARTIAL_DIAGNOSTIC_EXTREME_MIN_CENTS
                  ? rawDiagnosticOctave
                  : null;
            }

            const fifthMeasured = finalizeBucket(fifthBucketRef.current);
            if (fifthMeasured === null && targetFifth <= sampleRate / 2) {
              const diagnosticCfWin = precisionWindow(targetFifth, PARTIAL_DIAGNOSTIC_WINDOW_CENTS);
              const rawDiagnosticCFifth = detectPitchInWindow(
                buf,
                sampleRate,
                diagnosticCfWin.lo,
                diagnosticCfWin.hi,
              );
              diagnosticCFifthFreq =
                rawDiagnosticCFifth !== null &&
                Math.abs(centsFromNominal(rawDiagnosticCFifth, targetFifth)) >=
                  PARTIAL_DIAGNOSTIC_EXTREME_MIN_CENTS
                  ? rawDiagnosticCFifth
                  : null;
            }

            const octavePartial = getBucketPartial(octaveBucketRef.current, diagnosticOctaveFreq);
            const fifthPartial = getBucketPartial(fifthBucketRef.current, diagnosticCFifthFreq);

            const shouldEmitNow = uiUnlockedRef.current;
            const enoughTimePassed = nowMs - lastEmitMsRef.current >= EMIT_INTERVAL_MS;

            if (shouldEmitNow && enoughTimePassed) {
              lastEmitMsRef.current = nowMs;
              emitResult({
                frequency: smoothedFreq,
                octaveFrequency: octavePartial.measured,
                octaveDiagnosticFrequency: octavePartial.diagnostic,
                compoundFifthFrequency: fifthPartial.measured,
                compoundFifthDiagnosticFrequency: fifthPartial.diagnostic,
                noteName,
                cents: smoothedCentsRef.current,
                matchScore: score,
                lockQuality: lastLockQualityRef.current,
              });
            }
          } else {
            rejectReasonRef.current = 'no match';
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
              resetState();
              setResult({
                frequency: null,
                octaveFrequency: null,
                octaveDiagnosticFrequency: null,
                compoundFifthFrequency: null,
                compoundFifthDiagnosticFrequency: null,
                noteName: null,
                cents: null,
                matchScore: 0,
                lockQuality: 0,
              });
            }
          }
        } else {
          rejectReasonRef.current = `rms too low (rms=${rms.toFixed(4)} gate=${dynamicGate.toFixed(4)})`;
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
            resetState();
            setResult({
              frequency: null,
              octaveFrequency: null,
              octaveDiagnosticFrequency: null,
              compoundFifthFrequency: null,
              compoundFifthDiagnosticFrequency: null,
              noteName: null,
              cents: null,
              matchScore: 0,
              lockQuality: 0,
            });
          }
        }

        if (DEBUG_ENABLED) {
          setDebugInfo({
            audioState: audioCtxRef.current?.state ?? 'none',
            rms,
            rmsPeak: rmsPeakRef.current,
            noiseFloor: noiseFloorRef.current,
            waitingStabilization: waitingForStabilizationRef.current,
            matchScore: lastMatchScoreRef.current,
            noteName: lastNoteNameRef.current,
            rawFreq: lastRawFreqRef.current,
            smoothedFreq: smoothedFreqRef.current,
            rejectReason: rejectReasonRef.current,
          });
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      isStartedRef.current = false;
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, [emitResult, resetState]);

  const stopListening = useCallback(() => {
    isStartedRef.current = false;
    resetState();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({
      frequency: null,
      octaveFrequency: null,
      octaveDiagnosticFrequency: null,
      compoundFifthFrequency: null,
      compoundFifthDiagnosticFrequency: null,
      noteName: null,
      cents: null,
      matchScore: 0,
      lockQuality: 0,
    });
  }, [resetState]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening, debugInfo };
};
