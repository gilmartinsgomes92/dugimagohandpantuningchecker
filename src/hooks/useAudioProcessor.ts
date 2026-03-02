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

export const useAudioProcessor = () => {
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<AudioResult>({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(8192 * 4)));
  const freqBufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(new ArrayBuffer(4096 * 4)));
  // Re-entrancy guard: prevents duplicate audio streams from concurrent startListening calls
  const isStartedRef = useRef(false);
  // Consecutive silent/failed frames counter for silence grace logic
  const silenceCountRef = useRef(0);
  // EMA smoothing state for frequency output (null = not yet initialised)
  const smoothedFreqRef = useRef<number | null>(null);
  const smoothedMidiRef = useRef<number | null>(null);
  const smoothedOctaveRef = useRef<number | null>(null);
  const smoothedCFifthRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number | null>(null);
  const noteOnsetMsRef = useRef<number>(0);
  const lastEmitMsRef = useRef<number>(0);

  // Strike handling: delay measurement until sustain phase
  const strikeTimeRef = useRef<number>(0);
  const waitingForStabilizationRef = useRef<boolean>(false);

  // Number of consecutive below-threshold frames before clearing the result to null.
  // Prevents flicker when a handpan note's amplitude gradually decays through the RMS
  // threshold, causing the display to oscillate between the note and "Listening…".
  const SILENCE_GRACE_FRAMES = 5;
  // Handpan strike handling
  const STRIKE_RMS_THRESHOLD = 0.02;
  const STRIKE_COOLDOWN_MS = 900;
  const STABILIZATION_DELAY_MS = 480;
  const EMIT_INTERVAL_MS = 70; // ~14 Hz UI updates
  const ONSET_DELAY_MS = 450;  // hide cents during attack
  const CENTS_SMOOTH_ALPHA = 0.18;

  const startListening = useCallback(async () => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    silenceCountRef.current = 0;
    smoothedFreqRef.current = null;
    smoothedMidiRef.current = null;
    smoothedOctaveRef.current = null;
    smoothedCFifthRef.current = null;
    smoothedCentsRef.current = null;
    noteOnsetMsRef.current = 0;
    lastEmitMsRef.current = 0;
    strikeTimeRef.current = 0;
    waitingForStabilizationRef.current = false;
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: 48000,
  },
  video: false,
});
      if (!isStartedRef.current) {
        stream.getTracks().forEach(t => t.stop());
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

        // Strike detection: on handpans, the attack transient is not tunable.
        // We detect the strike and wait a short stabilization delay before measuring.
        if (rms > STRIKE_RMS_THRESHOLD && now - strikeTimeRef.current > STRIKE_COOLDOWN_MS) {
          strikeTimeRef.current = now;
          waitingForStabilizationRef.current = true;
        }

        if (waitingForStabilizationRef.current) {
          if (now - strikeTimeRef.current < STABILIZATION_DELAY_MS) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          waitingForStabilizationRef.current = false;
        }

        if (rms >= 0.005) {
          // Stage 1 — Note Identification: spectral template matching against all
          // handpan notes (MIDI 50–84). Scores the entire FFT spectrum against known
          // harmonic templates so that notes where the octave/compound-fifth is louder
          // than the fundamental are still identified correctly.
          const match = matchNote(
            freqBufRef.current,
            audioCtxRef.current.sampleRate,
            analyserRef.current.fftSize,
          );

          if (match !== null) {
            silenceCountRef.current = 0;
            const { midiNote, nominalFreq, score } = match;
            const sampleRate = audioCtxRef.current.sampleRate;

            // Note-change reset: when the spectral matcher locks onto a different MIDI
            // note, clear all smoothing state so there is no sluggish crossfade.
            if (smoothedMidiRef.current !== null && smoothedMidiRef.current !== midiNote) {
            smoothedFreqRef.current = null;
            smoothedOctaveRef.current = null;
            smoothedCFifthRef.current = null;

             // reset cents smoothing + onset timing on note change
           smoothedCentsRef.current = null;
           noteOnsetMsRef.current = performance.now();
           lastEmitMsRef.current = 0;
           }

            smoothedMidiRef.current = midiNote;
            if (noteOnsetMsRef.current === 0) noteOnsetMsRef.current = performance.now();

            // Stage 2 — Precision Measurement: run detectPitchInWindow with tight
            // ±20-cent windows centered on the known ET frequencies. This uses the
            // raw time-domain buffer with a Hann-windowed 4096-point FFT for higher
            // accuracy than the AnalyserNode's pre-computed FFT.
            const fundWin = precisionWindow(nominalFreq);
            let freq = detectPitchInWindow(buf, sampleRate, fundWin.lo, fundWin.hi);

            const octaveNominal = nominalFreq * 2;
            const octWin = precisionWindow(octaveNominal);
            const octaveFreq = detectPitchInWindow(buf, sampleRate, octWin.lo, octWin.hi);

            // Fallback: derive fundamental from octave if the fundamental partial is
            // below the noise floor (common on high-octave handpan notes during decay).
            // This is safe because octaveFreq was detected within ±PRECISION_WINDOW_CENTS
            // of nominalFreq × 2, so octaveFreq / 2 is guaranteed to be close to the
            // true fundamental and stays close to the matched nominal note.
            if (freq === null && octaveFreq !== null) {
              freq = octaveFreq / 2;
            }

            if (freq !== null) {
              // Outlier gate: skip frames where the raw frequency jumps more than
              // MAX_CENTS_JUMP cents from the current smoothed value (likely a glitch).
              if (smoothedFreqRef.current !== null) {
                const centsJump = Math.abs(1200 * Math.log2(freq / smoothedFreqRef.current));
                if (centsJump > MAX_CENTS_JUMP) {
                  rafRef.current = requestAnimationFrame(tick);
                  return;
                }
              }

              // EMA smoothing on fundamental frequency
              smoothedFreqRef.current = smoothedFreqRef.current === null
                ? freq
                : FREQ_SMOOTH_ALPHA * freq + (1 - FREQ_SMOOTH_ALPHA) * smoothedFreqRef.current;

              const smoothedFreq = smoothedFreqRef.current;

    const noteName = midiToFullName(midiNote);

// cents relative to the matched note nominal (NOT nearest note)
const rawCents = clamp(centsFromNominal(smoothedFreq, nominalFreq), -60, 60);

// smooth in cents domain (more stable UI)
smoothedCentsRef.current =
  smoothedCentsRef.current === null
    ? rawCents
    : CENTS_SMOOTH_ALPHA * rawCents + (1 - CENTS_SMOOTH_ALPHA) * smoothedCentsRef.current;

// rate-limit UI updates + hide cents during attack transient
const nowMs = performance.now();
if (nowMs - lastEmitMsRef.current < EMIT_INTERVAL_MS) {
  rafRef.current = requestAnimationFrame(tick);
  return;
}
lastEmitMsRef.current = nowMs;

const showCents = nowMs - noteOnsetMsRef.current >= ONSET_DELAY_MS;
const compFifthNominal = nominalFreq * 3;
const cfWin = precisionWindow(compFifthNominal);

// Use detectPitchInWindow for compound fifth if within usable FFT range;
// fall back to findHarmonicFrequency otherwise.
const compFifthFreq =
  compFifthNominal <= sampleRate / 2
    ? detectPitchInWindow(buf, sampleRate, cfWin.lo, cfWin.hi)
    : findHarmonicFrequency(
        freqBufRef.current,
        compFifthNominal,
        sampleRate,
        analyserRef.current.fftSize,
      );

// EMA smoothing on octave and compound-fifth partials
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

// ✅ THIS was missing — emit the result (rate-limited)
setResult({
  frequency: smoothedFreq,
  octaveFrequency: smoothedOctaveRef.current,
  compoundFifthFrequency: smoothedCFifthRef.current,
  noteName,
  cents: showCents ? smoothedCentsRef.current : null,
  matchScore: score,
});
              
            } else {
              // Template matched but no measurable partial found — count as silent
              silenceCountRef.current += 1;
              if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
                smoothedFreqRef.current = null;
                smoothedMidiRef.current = null;
                smoothedOctaveRef.current = null;
                smoothedCFifthRef.current = null;
                smoothedCentsRef.current = null;
                noteOnsetMsRef.current = 0;
                lastEmitMsRef.current = 0;
                strikeTimeRef.current = 0;
                waitingForStabilizationRef.current = false;
                setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
              }
            }
          } else {
            // No template match above threshold — count as silent/failed frame
            silenceCountRef.current += 1;
            if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
              smoothedFreqRef.current = null;
              smoothedMidiRef.current = null;
              smoothedOctaveRef.current = null;
              smoothedCFifthRef.current = null;
              smoothedCentsRef.current = null;
              noteOnsetMsRef.current = 0;
              lastEmitMsRef.current = 0;
              strikeTimeRef.current = 0;
              waitingForStabilizationRef.current = false;
              setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
            }
          }
        } else {
          // Signal below noise floor — use silence grace to avoid flickering when the
          // note's amplitude decays gradually through the RMS threshold.
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= SILENCE_GRACE_FRAMES) {
            smoothedFreqRef.current = null;
            smoothedMidiRef.current = null;
            smoothedOctaveRef.current = null;
            smoothedCFifthRef.current = null;
            smoothedCentsRef.current = null;
            noteOnsetMsRef.current = 0;
            lastEmitMsRef.current = 0;
            strikeTimeRef.current = 0;
            waitingForStabilizationRef.current = false;
            setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      isStartedRef.current = false;
      setError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  const stopListening = useCallback(() => {
    isStartedRef.current = false;
    silenceCountRef.current = 0;
    smoothedFreqRef.current = null;
    smoothedMidiRef.current = null;
    smoothedOctaveRef.current = null;
    smoothedCFifthRef.current = null;
    smoothedCentsRef.current = null;
    noteOnsetMsRef.current = 0;
    lastEmitMsRef.current = 0;
    strikeTimeRef.current = 0;
    waitingForStabilizationRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsListening(false);
    setResult({ frequency: null, octaveFrequency: null, compoundFifthFrequency: null, noteName: null, cents: null, matchScore: 0 });
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  return { isListening, result, error, startListening, stopListening };
};
