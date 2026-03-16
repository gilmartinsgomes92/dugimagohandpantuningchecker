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
  // Wide diagnostic octave candidate used only when the normal octave lock misses.
  octaveDiagnosticFrequency: number | null;
  // Independently measured 3rd partial (compound fifth) — may differ from 3×frequency.
  compoundFifthFrequency: number | null;
  // Wide diagnostic compound-fifth candidate used only when the normal lock misses.
  compoundFifthDiagnosticFrequency: number | null;
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

/** Strike-window parameters for “one hit lock” (GuitarApp-like behaviour). */
const IGNORE_AFTER_STRIKE_MS = 140; // skip attack transient
const MEASURE_WINDOW_MS = 420; // short sustain sampling
const MIN_WINDOW_FRAMES = 9;
const MAX_WINDOW_FRAMES = 24;

type WindowFrame = { freq: number; cents: number; quality: number };

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mad(nums: number[], med: number): number {
  const dev = nums.map((v) => Math.abs(v - med));
  return median(dev);
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

  // TS + CF build: avoid SharedArrayBuffer typing mismatch
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(8192 * 4)));
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(4096 * 4)));

  // Re-entrancy guard
  const isStartedRef = useRef(false);

  // Silence grace
  const silenceCountRef = useRef(0);

  // Smoothing state
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
    smoothedOctaveDiagnosticRef.current = null;
    smoothedCFifthRef.current = null;
    smoothedCFifthDiagnosticRef.current = null;
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
analyser.fftSize = 8192;
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
            const { midiNote, nominalFreq, score } = match;
            const sampleRate = audioCtxRef.current.sampleRate;

            lastMatchScoreRef.current = score;
            lastNoteNameRef.current = midiToFullName(midiNote);

            if (smoothedMidiRef.current !== null && smoothedMidiRef.current !== midiNote) {
              smoothedFreqRef.current = null;
              smoothedOctaveRef.current = null;
              smoothedOctaveDiagnosticRef.current = null;
              smoothedCFifthRef.current = null;
              smoothedCFifthDiagnosticRef.current = null;
              smoothedCentsRef.current = null;
              noteOnsetMsRef.current = performance.now();
              strikeAtMsRef.current = performance.now();
              windowFramesRef.current = [];
              lastLockQualityRef.current = 0;
              lastEmitMsRef.current = 0;
            }

            smoothedMidiRef.current = midiNote;
            if (noteOnsetMsRef.current === 0) {
              noteOnsetMsRef.current = performance.now();
              strikeAtMsRef.current = noteOnsetMsRef.current;
              windowFramesRef.current = [];
              lastLockQualityRef.current = 0;
            }

            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            const octaveNominal = nominalFreq * 2;
            const octWin = precisionWindow(octaveNominal);
            let octaveFreq = detectPitchInWindow(buf, sampleRate, octWin.lo, octWin.hi);
            let diagnosticOctaveFreq: number | null = null;

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

            if (octaveFreq === null) {
              const diagnosticOctWin = precisionWindow(octaveNominal, PARTIAL_DIAGNOSTIC_WINDOW_CENTS);
              const rawDiagnosticOctave = detectPitchInWindow(buf, sampleRate, diagnosticOctWin.lo, diagnosticOctWin.hi);
              diagnosticOctaveFreq =
                rawDiagnosticOctave !== null &&
                Math.abs(centsFromNominal(rawDiagnosticOctave, octaveNominal)) >= PARTIAL_DIAGNOSTIC_EXTREME_MIN_CENTS
                  ? rawDiagnosticOctave
                  : null;
            }

            if (freq === null && octaveFreq !== null) {
              freq = octaveFreq / 2;
            }

            
            // --- Strike-window lock (fast, stable) ---
            const nowMs = performance.now();
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
              windowFramesRef.current.push({ freq, cents, quality: score });
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

              const compFifthNominal = nominalFreq * 3;
              const cfWin = precisionWindow(compFifthNominal);
              const wideCfWin = precisionWindow(compFifthNominal, FALLBACK_PRECISION_WINDOW_CENTS);
              const compFifthFreq =
                compFifthNominal <= sampleRate / 2
                  ? detectPitchInWindow(buf, sampleRate, cfWin.lo, cfWin.hi) ??
                    detectPitchInWindow(buf, sampleRate, wideCfWin.lo, wideCfWin.hi)
                  : findHarmonicFrequency(
                      freqBufRef.current,
                      compFifthNominal,
                      sampleRate,
                      analyserRef.current.fftSize,
                    );

              let diagnosticCFifthFreq: number | null = null;
              if (compFifthFreq === null && compFifthNominal <= sampleRate / 2) {
                const diagnosticCfWin = precisionWindow(compFifthNominal, PARTIAL_DIAGNOSTIC_WINDOW_CENTS);
                const rawDiagnosticCFifth = detectPitchInWindow(buf, sampleRate, diagnosticCfWin.lo, diagnosticCfWin.hi);
                diagnosticCFifthFreq =
                  rawDiagnosticCFifth !== null &&
                  Math.abs(centsFromNominal(rawDiagnosticCFifth, compFifthNominal)) >= PARTIAL_DIAGNOSTIC_EXTREME_MIN_CENTS
                    ? rawDiagnosticCFifth
                    : null;
              }

              smoothedOctaveRef.current =
                octaveFreq === null
                  ? smoothedOctaveRef.current
                  : smoothedOctaveRef.current === null
                    ? octaveFreq
                    : FREQ_SMOOTH_ALPHA * octaveFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveRef.current;

              smoothedOctaveDiagnosticRef.current =
                diagnosticOctaveFreq === null
                  ? smoothedOctaveDiagnosticRef.current
                  : smoothedOctaveDiagnosticRef.current === null
                    ? diagnosticOctaveFreq
                    : FREQ_SMOOTH_ALPHA * diagnosticOctaveFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveDiagnosticRef.current;

              smoothedCFifthRef.current =
                compFifthFreq === null
                  ? smoothedCFifthRef.current
                  : smoothedCFifthRef.current === null
                    ? compFifthFreq
                    : FREQ_SMOOTH_ALPHA * compFifthFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthRef.current;

              smoothedCFifthDiagnosticRef.current =
                diagnosticCFifthFreq === null
                  ? smoothedCFifthDiagnosticRef.current
                  : smoothedCFifthDiagnosticRef.current === null
                    ? diagnosticCFifthFreq
                    : FREQ_SMOOTH_ALPHA * diagnosticCFifthFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthDiagnosticRef.current;

              setResult({
                frequency: smoothedFreq,
                octaveFrequency: smoothedOctaveRef.current,
                octaveDiagnosticFrequency: smoothedOctaveDiagnosticRef.current,
                compoundFifthFrequency: smoothedCFifthRef.current,
                compoundFifthDiagnosticFrequency: smoothedCFifthDiagnosticRef.current,
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
