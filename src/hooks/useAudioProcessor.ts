import { useState, useRef, useCallback, useEffect } from 'react';
import { computeRMS } from '../utils/yin';
import { findHarmonicFrequency } from '../utils/harmonicAnalyzer';
import { detectPitchInWindow } from '../utils/pitchInWindow';
import { matchNote } from '../utils/spectralMatcher';

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
function precisionWindow(targetFreq: number): { lo: number; hi: number } {
  const ratio = Math.pow(2, PRECISION_WINDOW_CENTS / 1200);
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

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({
    frequency: null,
    octaveFrequency: null,
    compoundFifthFrequency: null,
    noteName: null,
    cents: null,
    matchScore: 0,
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
  const smoothedCFifthRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number | null>(null);
  const noteOnsetMsRef = useRef<number>(0);
  const lastEmitMsRef = useRef<number>(0);

  // Debug trackers
  const rmsPeakRef = useRef(0);
  const noiseFloorRef = useRef(0.002);
  const rejectReasonRef = useRef('');
  const lastMatchScoreRef = useRef(0);
  const lastNoteNameRef = useRef<string | null>(null);
  const lastRawFreqRef = useRef<number | null>(null);

  const stablePitchFramesRef = useRef(0);

  // Strike handling: delay measurement until sustain phase
  const strikeTimeRef = useRef<number>(0);
  const waitingForStabilizationRef = useRef<boolean>(false);

  // Strike re-arm hysteresis (fix iOS pulsing)
  const strikeArmedRef = useRef<boolean>(true);
  const quietFramesRef = useRef<number>(999);

  // Platform tuning
  const IS_IOS =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const SILENCE_GRACE_FRAMES = 5;

  // Main audio gate (keeps CPU down)
  const SIGNAL_RMS_THRESHOLD = IS_IOS ? 0.003 : 0.005;

  // Strike hysteresis thresholds
  const ARM_RMS_THRESHOLD = IS_IOS ? 0.0045 : 0.006;
  const STRIKE_RMS_THRESHOLD = IS_IOS ? 0.012 : 0.02;
  const REARM_QUIET_FRAMES = IS_IOS ? 10 : 6;

  const STRIKE_COOLDOWN_MS = IS_IOS ? 700 : 900;
  const STABILIZATION_DELAY_MS = IS_IOS ? 260 : 480;

  // UI / cents behavior
  const EMIT_INTERVAL_MS = 70; // ~14 Hz
  const ONSET_DELAY_MS = 450;
  const CENTS_SMOOTH_ALPHA = 0.18;

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

    strikeTimeRef.current = 0;
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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
        },
        video: false,
      });

      if (!isStartedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      freqBufRef.current = new Float32Array(new ArrayBuffer((analyser.fftSize / 2) * 4));

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const tick = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        const buf = bufferRef.current;
        analyserRef.current.getFloatTimeDomainData(buf);
        analyserRef.current.getFloatFrequencyData(freqBufRef.current);

        const rms = computeRMS(buf);
        const now = performance.now();

        // Track peak and a moving noise-floor estimate
        rmsPeakRef.current = Math.max(rmsPeakRef.current * 0.96, rms);
        if (rms < 0.004) {
          noiseFloorRef.current = 0.98 * noiseFloorRef.current + 0.02 * rms;
        }

        rejectReasonRef.current = '';

        // Main gate
        if (rms >= SIGNAL_RMS_THRESHOLD) {
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
              smoothedCFifthRef.current = null;
              smoothedCentsRef.current = null;
              noteOnsetMsRef.current = performance.now();
              lastEmitMsRef.current = 0;
            }

            smoothedMidiRef.current = midiNote;
            if (noteOnsetMsRef.current === 0) noteOnsetMsRef.current = performance.now();

            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            const octaveNominal = nominalFreq * 2;
            const octWin = precisionWindow(octaveNominal);
            const octaveFreq = detectPitchInWindow(buf, sampleRate, octWin.lo, octWin.hi);

            if (freq === null && octaveFreq !== null) {
              freq = octaveFreq / 2;
            }

            if (lastRawFreqRef.current !== null) {
  const centsDelta = Math.abs(
    1200 * Math.log2(freq / lastRawFreqRef.current)
  );

  if (centsDelta < 3) {
    stablePitchFramesRef.current++;
  } else {
    stablePitchFramesRef.current = 0;
  }
}

lastRawFreqRef.current = freq;

// Require ~120ms of stable pitch before reading
if (stablePitchFramesRef.current < 6) {
  rejectReasonRef.current = 'pitch not stable';
  rafRef.current = requestAnimationFrame(tick);
  return;
}

            lastRawFreqRef.current = freq;

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

              const showCents = nowMs - noteOnsetMsRef.current >= ONSET_DELAY_MS;

              const compFifthNominal = nominalFreq * 3;
              const cfWin = precisionWindow(compFifthNominal);
              const compFifthFreq =
                compFifthNominal <= sampleRate / 2
                  ? detectPitchInWindow(buf, sampleRate, cfWin.lo, cfWin.hi)
                  : findHarmonicFrequency(
                      freqBufRef.current,
                      compFifthNominal,
                      sampleRate,
                      analyserRef.current.fftSize,
                    );

              smoothedOctaveRef.current =
                octaveFreq === null
                  ? smoothedOctaveRef.current
                  : smoothedOctaveRef.current === null
                    ? octaveFreq
                    : FREQ_SMOOTH_ALPHA * octaveFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedOctaveRef.current;

              smoothedCFifthRef.current =
                compFifthFreq === null
                  ? smoothedCFifthRef.current
                  : smoothedCFifthRef.current === null
                    ? compFifthFreq
                    : FREQ_SMOOTH_ALPHA * compFifthFreq + (1 - FREQ_SMOOTH_ALPHA) * smoothedCFifthRef.current;

              setResult({
                frequency: smoothedFreq,
                octaveFrequency: smoothedOctaveRef.current,
                compoundFifthFrequency: smoothedCFifthRef.current,
                noteName,
                cents: showCents ? smoothedCentsRef.current : null,
                matchScore: score,
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
              });
            }
          }
        } else {
          rejectReasonRef.current = 'rms too low';
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
    });
  }, [resetState]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening, debugInfo };
};
