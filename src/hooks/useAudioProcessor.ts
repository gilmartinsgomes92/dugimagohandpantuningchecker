import { useState, useRef, useCallback, useEffect } from 'react';
import { computeRMS } from '../utils/yin';
import { findHarmonicFrequency } from '../utils/harmonicAnalyzer';
import { detectPitchInWindow } from '../utils/pitchInWindow';
import { matchNote } from '../utils/spectralMatcher';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

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
  // Lock quality (0–1). Based on stability of the pitch in the post-strike window.
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

/** EMA smoothing factor for frequency output (0–1). Lower = more smoothing. */
const FREQ_SMOOTH_ALPHA = 0.15;

/**
 * Maximum cents jump allowed between consecutive smoothed readings.
 * Frames where the raw frequency jumps more than this from the smoothed value
 * are treated as spectral glitches and skipped entirely.
 */
const MAX_CENTS_JUMP = 45;

/**
 * Returns the Hz search bounds for a ±PRECISION_WINDOW_CENTS window around targetFreq.
 */
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

function midiToFrequencyLocal(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
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

const SILENCE_GRACE_FRAMES = 10;

// Main audio gate (keeps CPU down)
const SIGNAL_RMS_THRESHOLD = IS_IOS ? 0.003 : 0.005;

// UI / cents behavior
const EMIT_INTERVAL_MS = 70; // ~14 Hz
const CENTS_SMOOTH_ALPHA = 0.18;

/** Strike-window parameters for “one hit lock” (GuitarApp-like behaviour). */
const IGNORE_AFTER_STRIKE_MS = 110; // skip attack transient
const MEASURE_WINDOW_MS = 220; // short sustain sampling
const MIN_WINDOW_FRAMES = 6;
const MAX_WINDOW_FRAMES = 16;

/** Partial-only lock/refinement windows (do not affect fundamental behaviour). */
const PARTIAL_IGNORE_AFTER_STRIKE_MS = 130;
const PARTIAL_DISPLAY_DELAY_MS = 380;
const PARTIAL_TRACK_WINDOW_MS = 3200;
const PARTIAL_STABLE_WINDOW_MS = 1300;
const PARTIAL_HOLD_MS = 1800;

const MIN_OCTAVE_FRAMES = 4;
const MAX_OCTAVE_FRAMES = 56;
const MIN_CFIFTH_FRAMES = 4;
const MAX_CFIFTH_FRAMES = 56;

const OCTAVE_MAX_MAD_CENTS = 22;
const CFIFTH_MAX_MAD_CENTS = 26;
const EXTREME_PARTIAL_THRESHOLD_CENTS = 120;
const OCTAVE_NORMAL_ACQUIRE_WINDOW_CENTS = 70;
const OCTAVE_NORMAL_TRACK_WINDOW_CENTS = 40;
const OCTAVE_EXTREME_ACQUIRE_WINDOW_CENTS = 650;
const OCTAVE_EXTREME_TRACK_WINDOW_CENTS = 110;

const CFIFTH_NORMAL_ACQUIRE_WINDOW_CENTS = 90;
const CFIFTH_NORMAL_TRACK_WINDOW_CENTS = 48;
const CFIFTH_EXTREME_ACQUIRE_WINDOW_CENTS = 650;
const CFIFTH_EXTREME_TRACK_WINDOW_CENTS = 130;

const OCTAVE_MIN_RATIO = 1.4;
const OCTAVE_MAX_RATIO = 2.9;
const CFIFTH_MIN_RATIO = 2.0;
const CFIFTH_MAX_RATIO = 4.4;

const NORMAL_LANE_MIN_DOMINANCE_DB = 2.5;
const EXTREME_LANE_MIN_DOMINANCE_DB = 5.5;
const EXTREME_LANE_MIN_TARGET_ERROR_CENTS = 110;

type DetectionLane = 'normal' | 'extreme';

type WindowFrame = { freq: number; cents: number; quality: number; ts: number; lane: DetectionLane };

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mad(nums: number[], med: number): number {
  const dev = nums.map((v) => Math.abs(v - med));
  return median(dev);
}

function pushFrame(list: WindowFrame[], frame: WindowFrame, maxFrames: number): void {
  list.push(frame);
  if (list.length > maxFrames) list.shift();
}

function pruneFrames(list: WindowFrame[], nowMs: number, maxAgeMs: number): WindowFrame[] {
  return list.filter((frame) => nowMs - frame.ts <= maxAgeMs);
}

function finalizeStableFrequency(
  frames: WindowFrame[],
  minFrames: number,
  maxMadCents: number,
  nowMs: number,
  stableWindowMs: number,
): number | null {
  const recentFrames = pruneFrames(frames, nowMs, stableWindowMs);
  if (recentFrames.length < minFrames) return null;

  const centsArr = recentFrames.map((f) => f.cents);
  const centsMed = median(centsArr);
  const isExtreme = Math.abs(centsMed) >= EXTREME_PARTIAL_THRESHOLD_CENTS;
  const effectiveMinFrames = isExtreme ? Math.max(minFrames, 7) : minFrames;
  const effectiveMadCents = isExtreme ? Math.max(maxMadCents, 28) : maxMadCents;

  if (recentFrames.length < effectiveMinFrames) return null;

  const extremeFrames = recentFrames.filter((f) => f.lane === 'extreme').length;
  if (isExtreme && extremeFrames < Math.ceil(effectiveMinFrames * 0.65)) return null;

  const centsMad = mad(centsArr, centsMed);
  if (centsMad > effectiveMadCents) return null;

  const selected = recentFrames
    .filter((f) => Math.abs(f.cents - centsMed) <= Math.max(effectiveMadCents * 1.8, 18))
    .sort((a, b) => (b.quality - a.quality) || (b.ts - a.ts))
    .slice(0, Math.max(effectiveMinFrames, Math.ceil(recentFrames.length * 0.75)))
    .map((f) => f.freq);

  if (selected.length < effectiveMinFrames) return null;
  return median(selected);
}

function finalizeStablePartialFrequency(
  frames: WindowFrame[],
  harmonicType: 'octave' | 'compoundFifth',
  nowMs: number,
  stableWindowMs: number,
): number | null {
  return finalizeStableFrequency(
    frames,
    harmonicType === 'octave'
      ? MIN_OCTAVE_FRAMES
      : MIN_CFIFTH_FRAMES,
    harmonicType === 'octave'
      ? OCTAVE_MAX_MAD_CENTS
      : CFIFTH_MAX_MAD_CENTS,
    nowMs,
    stableWindowMs,
  );
}

function getLaneWindowCents(
  harmonicType: 'octave' | 'compoundFifth',
  lane: DetectionLane,
  hasHistory: boolean,
): number {
  if (harmonicType === 'octave') {
    if (lane === 'normal') {
      return hasHistory ? OCTAVE_NORMAL_TRACK_WINDOW_CENTS : OCTAVE_NORMAL_ACQUIRE_WINDOW_CENTS;
    }
    return hasHistory ? OCTAVE_EXTREME_TRACK_WINDOW_CENTS : OCTAVE_EXTREME_ACQUIRE_WINDOW_CENTS;
  }

  if (lane === 'normal') {
    return hasHistory ? CFIFTH_NORMAL_TRACK_WINDOW_CENTS : CFIFTH_NORMAL_ACQUIRE_WINDOW_CENTS;
  }
  return hasHistory ? CFIFTH_EXTREME_TRACK_WINDOW_CENTS : CFIFTH_EXTREME_ACQUIRE_WINDOW_CENTS;
}

type PartialCandidate = {
  frequency: number;
  lane: DetectionLane;
  agreementQuality: number;
  dominanceDb: number;
  targetErrorCents: number;
};

function getMagnitudeAtFrequency(
  freqData: Float32Array,
  sampleRate: number,
  freq: number,
): number {
  const nyquist = sampleRate / 2;
  if (freq <= 0 || freq >= nyquist) return -Infinity;

  const bin = (freq / nyquist) * (freqData.length - 1);
  const lo = Math.max(0, Math.floor(bin));
  const hi = Math.min(freqData.length - 1, lo + 1);
  if (lo === hi) return freqData[lo];
  const mix = bin - lo;
  return freqData[lo] + (freqData[hi] - freqData[lo]) * mix;
}

function getPeakDominanceDb(
  freqData: Float32Array,
  candidateFreq: number,
  searchCenterFreq: number,
  searchWindowCents: number,
  sampleRate: number,
  fftSize: number,
): number {
  const candidateMag = getMagnitudeAtFrequency(freqData, sampleRate, candidateFreq);
  if (!Number.isFinite(candidateMag)) return -Infinity;

  const { lo, hi } = precisionWindow(searchCenterFreq, searchWindowCents);
  const lowFreq = Math.max(lo, 1);
  const highFreq = Math.min(hi, sampleRate / 2 - 1);
  if (lowFreq >= highFreq) return -Infinity;

  const binHz = sampleRate / fftSize;
  const lowBin = Math.max(1, Math.floor(lowFreq / binHz));
  const highBin = Math.min(freqData.length - 2, Math.ceil(highFreq / binHz));
  if (lowBin >= highBin) return -Infinity;

  const candidateBin = Math.round(candidateFreq / binHz);
  const exclusionRadiusBins = Math.max(2, Math.round(candidateFreq * 0.012 / binHz));

  let rivalMag = -Infinity;
  for (let bin = lowBin; bin <= highBin; bin += 1) {
    if (Math.abs(bin - candidateBin) <= exclusionRadiusBins) continue;
    if (freqData[bin] > rivalMag) rivalMag = freqData[bin];
  }

  if (!Number.isFinite(rivalMag)) return 24;
  return candidateMag - rivalMag;
}

function detectPartialLane(
  buffer: Float32Array,
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  searchCenterFreq: number,
  targetFreq: number,
  lockedFundamental: number,
  harmonicType: 'octave' | 'compoundFifth',
  lane: DetectionLane,
  hasHistory: boolean,
): PartialCandidate | null {
  const searchWindowCents = getLaneWindowCents(harmonicType, lane, hasHistory);
  const fftCandidate = findHarmonicFrequency(
    freqData,
    searchCenterFreq,
    sampleRate,
    fftSize,
    searchWindowCents,
  );
  const timeCandidate =
    searchCenterFreq < sampleRate / 2
      ? detectPitchInWindow(
          buffer,
          sampleRate,
          precisionWindow(searchCenterFreq, searchWindowCents).lo,
          precisionWindow(searchCenterFreq, searchWindowCents).hi,
        )
      : null;

  const best = chooseBestPartialCandidate(fftCandidate, timeCandidate, targetFreq);
  if (best === null || !isRatioValid(best, lockedFundamental, harmonicType)) return null;

  const dominanceDb = getPeakDominanceDb(
    freqData,
    best,
    searchCenterFreq,
    searchWindowCents,
    sampleRate,
    fftSize,
  );
  const minDominanceDb = lane === 'normal' ? NORMAL_LANE_MIN_DOMINANCE_DB : EXTREME_LANE_MIN_DOMINANCE_DB;
  if (dominanceDb < minDominanceDb) return null;

  const targetErrorCents = centsFromNominal(best, targetFreq);
  if (lane === 'extreme' && Math.abs(targetErrorCents) < EXTREME_LANE_MIN_TARGET_ERROR_CENTS) {
    return null;
  }

  return {
    frequency: best,
    lane,
    agreementQuality: getAgreementQuality(fftCandidate, timeCandidate),
    dominanceDb,
    targetErrorCents,
  };
}

function detectPartialCandidate(
  buffer: Float32Array,
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  nominalPartialFreq: number,
  trackedPartialFreq: number | null,
  lockedFundamental: number,
  harmonicType: 'octave' | 'compoundFifth',
): PartialCandidate | null {
  const hasHistory = trackedPartialFreq !== null;
  const searchCenterFreq = trackedPartialFreq ?? nominalPartialFreq;

  const normalCandidate = detectPartialLane(
    buffer,
    freqData,
    sampleRate,
    fftSize,
    searchCenterFreq,
    nominalPartialFreq,
    lockedFundamental,
    harmonicType,
    'normal',
    hasHistory,
  );
  if (normalCandidate !== null) return normalCandidate;

  return detectPartialLane(
    buffer,
    freqData,
    sampleRate,
    fftSize,
    searchCenterFreq,
    nominalPartialFreq,
    lockedFundamental,
    harmonicType,
    'extreme',
    hasHistory,
  );
}

function isRatioValid(
  candidate: number,
  lockedFundamental: number,
  harmonicType: 'octave' | 'compoundFifth',
): boolean {
  if (candidate <= 0 || lockedFundamental <= 0) return false;
  const ratio = candidate / lockedFundamental;
  return harmonicType === 'octave'
    ? ratio >= OCTAVE_MIN_RATIO && ratio <= OCTAVE_MAX_RATIO
    : ratio >= CFIFTH_MIN_RATIO && ratio <= CFIFTH_MAX_RATIO;
}

function getAgreementQuality(fftCandidate: number | null, timeCandidate: number | null): number {
  if (fftCandidate === null && timeCandidate === null) return 0;
  if (fftCandidate === null || timeCandidate === null) return 0.64;
  const deltaCents = Math.abs(centsFromNominal(fftCandidate, timeCandidate));
  return clamp(1 - deltaCents / 35, 0, 1);
}

function chooseBestPartialCandidate(
  fftCandidate: number | null,
  timeCandidate: number | null,
  referenceFreq: number,
): number | null {
  if (fftCandidate === null) return timeCandidate;
  if (timeCandidate === null) return fftCandidate;

  const fftErr = Math.abs(centsFromNominal(fftCandidate, referenceFreq));
  const timeErr = Math.abs(centsFromNominal(timeCandidate, referenceFreq));

  if (Math.abs(fftErr - timeErr) > 7) {
    return fftErr <= timeErr ? fftCandidate : timeCandidate;
  }

  return (fftCandidate + timeCandidate) / 2;
}
export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({
    frequency: null,
    octaveFrequency: null,
    compoundFifthFrequency: null,
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

  // TS + CF build: avoid SharedArrayBuffer typing mismatch
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(16384 * 4)));
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(8192 * 4)));

  // Re-entrancy guard
  const isStartedRef = useRef(false);

  // Silence grace
  const silenceCountRef = useRef(0);

  // Smoothing state
  const smoothedFreqRef = useRef<number | null>(null);
  const smoothedMidiRef = useRef<number | null>(null);
  const smoothedOctaveRef = useRef<number | null>(null);
  const smoothedCFifthRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number | null>(null);
  const noteOnsetMsRef = useRef<number>(0);
  const strikeAtMsRef = useRef<number>(0);
  const windowFramesRef = useRef<WindowFrame[]>([]);
  const octaveFramesRef = useRef<WindowFrame[]>([]);
  const cFifthFramesRef = useRef<WindowFrame[]>([]);
  const octaveMissesRef = useRef<number>(0);
  const cFifthMissesRef = useRef<number>(0);
  const octaveLastStableMsRef = useRef<number>(0);
  const cFifthLastStableMsRef = useRef<number>(0);
  const lastLockQualityRef = useRef<number>(0);
  const lastEmitMsRef = useRef<number>(0);

  // Debug trackers
  const rmsPeakRef = useRef(0);
  const noiseFloorRef = useRef(0.002);
  const rejectReasonRef = useRef('');
  const lastMatchScoreRef = useRef(0);
  const lastNoteNameRef = useRef<string | null>(null);
  const lastRawFreqRef = useRef<number | null>(null);

  // Strike handling: delay measurement until sustain phase
  const waitingForStabilizationRef = useRef<boolean>(false);

  // Strike re-arm hysteresis (fix iOS pulsing)
  const strikeArmedRef = useRef<boolean>(true);
  const quietFramesRef = useRef<number>(999);

  const resetState = useCallback(() => {
    silenceCountRef.current = 0;
    smoothedFreqRef.current = null;
    smoothedMidiRef.current = null;
    smoothedOctaveRef.current = null;
    smoothedCFifthRef.current = null;
    smoothedCentsRef.current = null;
    noteOnsetMsRef.current = 0;
    lastEmitMsRef.current = 0;

    rmsPeakRef.current = 0;
    noiseFloorRef.current = 0.002;
    rejectReasonRef.current = '';
    lastMatchScoreRef.current = 0;
    lastNoteNameRef.current = null;
    lastRawFreqRef.current = null;

    strikeAtMsRef.current = 0;
    windowFramesRef.current = [];
    octaveFramesRef.current = [];
    cFifthFramesRef.current = [];
    octaveMissesRef.current = 0;
    cFifthMissesRef.current = 0;
    octaveLastStableMsRef.current = 0;
    cFifthLastStableMsRef.current = 0;
    lastLockQualityRef.current = 0;

    waitingForStabilizationRef.current = false;
    strikeArmedRef.current = true;
    quietFramesRef.current = 999;
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

// ✅ iOS-safe: create AudioContext inside the user-gesture call stack (before awaiting)
const audioCtx = new AudioCtx({ latencyHint: 'interactive' });
audioCtxRef.current = audioCtx;

// Best-effort resume immediately (don’t await here to keep the gesture chain hot)
if (audioCtx.state === 'suspended') {
  audioCtx.resume().catch(() => {});
}

const analyser = audioCtx.createAnalyser();
analyser.fftSize = 16384;
analyser.smoothingTimeConstant = 0.85;
analyserRef.current = analyser;

bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
freqBufRef.current = new Float32Array(new ArrayBuffer((analyser.fftSize / 2) * 4));

// ✅ Keep audio graph “pulling” on iOS (silent destination connection)
const zeroGain = audioCtx.createGain();
zeroGain.gain.value = 0;
analyser.connect(zeroGain);
zeroGain.connect(audioCtx.destination);

// ✅ iOS “unlock” trick similar to GuitarApp (silent oscillator kick)
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
    // NOTE: avoid forcing sampleRate on iOS; it can break negotiation / cause silence
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

// iOS: sometimes it still ends up suspended until after the graph exists
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
// Track peak and a moving noise-floor estimate
        rmsPeakRef.current = Math.max(rmsPeakRef.current * 0.96, rms);
        if (rms < 0.004) {
          noiseFloorRef.current = 0.98 * noiseFloorRef.current + 0.02 * rms;
        }

        rejectReasonRef.current = '';

        // Main gate
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
            let { midiNote, nominalFreq, score } = match;
            const sampleRate = audioCtxRef.current.sampleRate;
            const nowMs = performance.now();

            lastMatchScoreRef.current = score;
            lastNoteNameRef.current = midiToFullName(midiNote);

            if (
              smoothedMidiRef.current !== null &&
              smoothedMidiRef.current !== midiNote &&
              smoothedFreqRef.current !== null &&
              lastLockQualityRef.current >= 0.55 &&
              strikeAtMsRef.current > 0 &&
              nowMs - strikeAtMsRef.current <= PARTIAL_TRACK_WINDOW_MS
            ) {
              midiNote = smoothedMidiRef.current;
              nominalFreq = midiToFrequencyLocal(midiNote);
              score = Math.max(score * 0.9, lastLockQualityRef.current);
              lastNoteNameRef.current = midiToFullName(midiNote);
            } else if (smoothedMidiRef.current !== null && smoothedMidiRef.current !== midiNote) {
              smoothedFreqRef.current = null;
              smoothedOctaveRef.current = null;
              smoothedCFifthRef.current = null;
              smoothedCentsRef.current = null;
              noteOnsetMsRef.current = nowMs;
              strikeAtMsRef.current = nowMs;
              windowFramesRef.current = [];
              octaveFramesRef.current = [];
              cFifthFramesRef.current = [];
              octaveMissesRef.current = 0;
              cFifthMissesRef.current = 0;
              octaveLastStableMsRef.current = 0;
              cFifthLastStableMsRef.current = 0;
              lastLockQualityRef.current = 0;
              lastEmitMsRef.current = 0;
            }

            smoothedMidiRef.current = midiNote;
            if (noteOnsetMsRef.current === 0) {
              noteOnsetMsRef.current = performance.now();
              strikeAtMsRef.current = noteOnsetMsRef.current;
              windowFramesRef.current = [];
              octaveFramesRef.current = [];
              cFifthFramesRef.current = [];
              octaveMissesRef.current = 0;
              cFifthMissesRef.current = 0;
              lastLockQualityRef.current = 0;
            }

            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            const octaveNominal = nominalFreq * 2;
            const octWin = precisionWindow(octaveNominal);
            let octaveFreq = detectPitchInWindow(buf, sampleRate, octWin.lo, octWin.hi);

            if (freq === null || octaveFreq === null) {
              const wideFundWin = precisionWindow(nominalFreq, FALLBACK_PRECISION_WINDOW_CENTS);
              const wideOctWin = precisionWindow(octaveNominal, FALLBACK_PRECISION_WINDOW_CENTS);

              if (freq === null) {
                freq = detectPitchInWindow(buf, sampleRate, wideFundWin.lo, wideFundWin.hi);
              }
              if (octaveFreq === null) {
                octaveFreq = detectPitchInWindow(buf, sampleRate, wideOctWin.lo, wideOctWin.hi);
              }
            }

            if (freq === null && octaveFreq !== null) {
              freq = octaveFreq / 2;
            }

            
            // --- Strike-window lock (fast, stable) ---
            if (strikeAtMsRef.current === 0) strikeAtMsRef.current = nowMs;

            // Detect note change (new strike window)
            if (noteOnsetMsRef.current === 0) noteOnsetMsRef.current = nowMs;

            // Collect post-attack frames in a short window
            const dt = nowMs - strikeAtMsRef.current;
            if (
              dt >= IGNORE_AFTER_STRIKE_MS &&
              dt <= IGNORE_AFTER_STRIKE_MS + MEASURE_WINDOW_MS &&
              freq !== null
            ) {
              const cents = clamp(centsFromNominal(freq, nominalFreq), -60, 60);
              windowFramesRef.current.push({ freq, cents, quality: score, ts: nowMs, lane: 'normal' });
              if (windowFramesRef.current.length > MAX_WINDOW_FRAMES) {
                windowFramesRef.current.shift();
              }
            }

            // If we have enough samples, lock using median + stability
            let lockedFreq: number | null = null;

            if (windowFramesRef.current.length >= MIN_WINDOW_FRAMES) {
              const frames = windowFramesRef.current;
              const freqs = frames.map(f => f.freq);
              const centsArr = frames.map(f => f.cents);
              const quals = frames.map(f => f.quality);

              const freqMed = median(freqs);
              const centsMed = median(centsArr);
              const qMed = median(quals);

              const centsMad = mad(centsArr, centsMed);
              const stability = clamp((6 - centsMad) / (6 - 1.5), 0, 1);
              const lockQuality = clamp(0.55 * qMed + 0.45 * stability, 0, 1);

              lastLockQualityRef.current = lockQuality;

              // Only emit a reading once we have a reasonable lock
              if (lockQuality >= 0.55) {
                lockedFreq = freqMed;
              }
            } else {
              lastLockQualityRef.current = Math.max(0, lastLockQualityRef.current - 0.04);
            }

            lastRawFreqRef.current = freq;

            // If we haven't locked yet, keep listening without emitting cents
            if (lockedFreq === null) {
              rejectReasonRef.current = 'collecting strike window';
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

            // Use the locked (median) values as the main output and apply light smoothing
            freq = lockedFreq;

            if (freq !== null) {
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

              const nowMs = performance.now();
              if (nowMs - lastEmitMsRef.current < EMIT_INTERVAL_MS) {
                rafRef.current = requestAnimationFrame(tick);
                return;
              }
              lastEmitMsRef.current = nowMs;

              const showCents = true;

              const octaveNominal = nominalFreq * 2;
              const compFifthNominal = nominalFreq * 3;

              const partialDt = nowMs - strikeAtMsRef.current;
              const shouldTrackPartials =
                partialDt >= PARTIAL_IGNORE_AFTER_STRIKE_MS &&
                partialDt <= PARTIAL_TRACK_WINDOW_MS &&
                smoothedFreq > 0;

              octaveFramesRef.current = pruneFrames(
                octaveFramesRef.current,
                nowMs,
                PARTIAL_TRACK_WINDOW_MS,
              );
              cFifthFramesRef.current = pruneFrames(
                cFifthFramesRef.current,
                nowMs,
                PARTIAL_TRACK_WINDOW_MS,
              );

              if (shouldTrackPartials) {
                const refinedOctave = detectPartialCandidate(
                  buf,
                  freqBufRef.current,
                  sampleRate,
                  analyserRef.current.fftSize,
                  octaveNominal,
                  smoothedOctaveRef.current,
                  smoothedFreq,
                  'octave',
                );

                if (refinedOctave !== null) {
                  pushFrame(
                    octaveFramesRef.current,
                    {
                      freq: refinedOctave.frequency,
                      cents: refinedOctave.targetErrorCents,
                      quality: clamp(
                        0.36 * score +
                          0.24 * refinedOctave.agreementQuality +
                          0.25 * clamp(refinedOctave.dominanceDb / 10, 0, 1) +
                          0.15 * clamp(1 - Math.abs(refinedOctave.targetErrorCents) / 900, 0, 1),
                        0,
                        1,
                      ),
                      ts: nowMs,
                      lane: refinedOctave.lane,
                    },
                    MAX_OCTAVE_FRAMES,
                  );
                  octaveMissesRef.current = 0;
                } else {
                  octaveMissesRef.current += 1;
                }

                const refinedCFifth =
                  compFifthNominal <= sampleRate / 2
                    ? detectPartialCandidate(
                        buf,
                        freqBufRef.current,
                        sampleRate,
                        analyserRef.current.fftSize,
                        compFifthNominal,
                        smoothedCFifthRef.current,
                        smoothedFreq,
                        'compoundFifth',
                      )
                    : null;

                if (refinedCFifth !== null) {
                  pushFrame(
                    cFifthFramesRef.current,
                    {
                      freq: refinedCFifth.frequency,
                      cents: refinedCFifth.targetErrorCents,
                      quality: clamp(
                        0.36 * score +
                          0.24 * refinedCFifth.agreementQuality +
                          0.25 * clamp(refinedCFifth.dominanceDb / 10, 0, 1) +
                          0.15 * clamp(1 - Math.abs(refinedCFifth.targetErrorCents) / 900, 0, 1),
                        0,
                        1,
                      ),
                      ts: nowMs,
                      lane: refinedCFifth.lane,
                    },
                    MAX_CFIFTH_FRAMES,
                  );
                  cFifthMissesRef.current = 0;
                } else {
                  cFifthMissesRef.current += 1;
                }
              }

              const canDisplayPartials = partialDt >= PARTIAL_DISPLAY_DELAY_MS;

              const stableOctave = canDisplayPartials
                ? finalizeStablePartialFrequency(
                    octaveFramesRef.current,
                    'octave',
                    nowMs,
                    PARTIAL_STABLE_WINDOW_MS,
                  )
                : null;

              const stableCFifth = canDisplayPartials
                ? finalizeStablePartialFrequency(
                    cFifthFramesRef.current,
                    'compoundFifth',
                    nowMs,
                    PARTIAL_STABLE_WINDOW_MS,
                  )
                : null;

              if (stableOctave !== null) {
                octaveLastStableMsRef.current = nowMs;
                smoothedOctaveRef.current =
                  smoothedOctaveRef.current === null
                    ? stableOctave
                    : FREQ_SMOOTH_ALPHA * stableOctave +
                      (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveRef.current;
              } else if (
                smoothedOctaveRef.current !== null &&
                nowMs - octaveLastStableMsRef.current > PARTIAL_HOLD_MS
              ) {
                smoothedOctaveRef.current = null;
              }

              if (stableCFifth !== null) {
                cFifthLastStableMsRef.current = nowMs;
                smoothedCFifthRef.current =
                  smoothedCFifthRef.current === null
                    ? stableCFifth
                    : FREQ_SMOOTH_ALPHA * stableCFifth +
                      (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthRef.current;
              } else if (
                smoothedCFifthRef.current !== null &&
                nowMs - cFifthLastStableMsRef.current > PARTIAL_HOLD_MS
              ) {
                smoothedCFifthRef.current = null;
              }

              setResult({
                frequency: smoothedFreq,
                octaveFrequency: smoothedOctaveRef.current,
                compoundFifthFrequency: smoothedCFifthRef.current,
                noteName,
                cents: showCents ? smoothedCentsRef.current : null,
                matchScore: score,
                lockQuality: lastLockQualityRef.current,
              });
            } else {
              rejectReasonRef.current = 'freq null';
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
                resetState();
                setResult({
                  frequency: null,
                  octaveFrequency: null,
                  compoundFifthFrequency: null,
                  noteName: null,
                  cents: null,
                  matchScore: 0,
                  lockQuality: 0,
                });
              }
            }
          } else {
            rejectReasonRef.current = 'no match';
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
              resetState();
              setResult({
                frequency: null,
                octaveFrequency: null,
                compoundFifthFrequency: null,
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
              compoundFifthFrequency: null,
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
  }, [resetState]);

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
      compoundFifthFrequency: null,
      noteName: null,
      cents: null,
      matchScore: 0,
      lockQuality: 0,
    });
  }, [resetState]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening, debugInfo };
};
