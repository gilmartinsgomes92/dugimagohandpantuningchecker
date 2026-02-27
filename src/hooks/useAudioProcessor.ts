/**
 * React hook for real-time audio processing.
 *
 * Uses:
 * - YIN algorithm for accurate fundamental frequency detection
 * - Web Audio AnalyserNode (32768-bin FFT) with parabolic interpolation
 *   for octave (2×) and compound fifth (3×) harmonic analysis
 *
 * Features:
 * - Adaptive RMS threshold with hysteresis (onset: 0.003, sustain: 0.0008) so
 *   notes continue to be detected through their full natural decay
 * - Adaptive YIN threshold that tightens as signal fades to prevent octave errors
 * - Golden snapshot captured at ~1 second into each note (the most reliable moment)
 * - Real-time detection quality score (0–100 %)
 * - Persistent reading log of recent snapshots
 *
 * Update rate: ~20 Hz (every 50ms)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { findHarmonicFrequency, calcCents, calcHarmonicClarity } from '../utils/harmonicAnalyzer';
import { frequencyToNote, midiToFrequency } from '../utils/musicUtils';
import type { TunerData, DetectionQuality, ReadingSnapshot } from '../types';

const FFT_SIZE = 32768;          // Large FFT for good harmonic resolution (~1.35 Hz/bin @ 44100)
const BUFFER_SIZE = 8192;        // YIN buffer (~186ms @ 44100)
const UPDATE_INTERVAL = 50;      // ms between tuner updates
const RMS_ONSET = 0.003;         // RMS level required to start a new note event
const RMS_SUSTAIN = 0.0008;      // RMS level below which a note is considered ended
const SNAPSHOT_DELAY_MS = 1000;  // Capture golden snapshot this many ms after note onset
const MAX_LOG_ENTRIES = 10;      // Maximum number of reading log entries to keep

/** Linearly interpolate between a and b by t (0–1) */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function useAudioProcessor() {
  const [tunerData, setTunerData] = useState<TunerData | null>(null);
  const [snapshot, setSnapshot] = useState<ReadingSnapshot | null>(null);
  const [readingLog, setReadingLog] = useState<ReadingSnapshot[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  const freqDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // Note-lifecycle tracking refs (not state, to avoid stale closures in the interval)
  const noteActiveRef = useRef(false);
  const noteOnsetTimeRef = useRef<number | null>(null);
  const snapshotCapturedRef = useRef(false);

  const processAudio = useCallback(() => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) return;

    const freqData = freqDataRef.current!;
    const timeData = timeDataRef.current!;

    // Get frequency domain data (in dB)
    analyser.getFloatFrequencyData(freqData);
    // Get time domain data for YIN
    analyser.getFloatTimeDomainData(timeData);

    const sampleRate = audioContext.sampleRate;
    const rms = computeRMS(timeData);
    const now = Date.now();

    // --- Hysteresis gate ---
    if (rms >= RMS_ONSET) {
      if (!noteActiveRef.current) {
        // New note onset
        noteActiveRef.current = true;
        noteOnsetTimeRef.current = now;
        snapshotCapturedRef.current = false;
      }
    } else if (rms < RMS_SUSTAIN) {
      // Signal has fully decayed — end note
      noteActiveRef.current = false;
      noteOnsetTimeRef.current = null;
    }
    // Between RMS_SUSTAIN and RMS_ONSET: hold the current state (hysteresis)

    if (!noteActiveRef.current) {
      setTunerData({
        fundamental: { frequency: null, cents: null, noteName: null, targetFrequency: null },
        octave: { frequency: null, cents: null },
        compoundFifth: { frequency: null, cents: null },
        hasSignal: false,
        quality: null,
      });
      return;
    }

    // --- Adaptive YIN threshold ---
    // As signal fades (rms → RMS_SUSTAIN), tighten the threshold to prevent octave errors.
    // High signal → 0.10 (permissive), low signal → 0.05 (strict).
    const signalRatio = Math.min(1, rms / RMS_ONSET);
    const yinThreshold = lerp(0.05, 0.10, signalRatio);

    // --- Fundamental detection via YIN ---
    const { frequency: fundamental, confidence: yinConf } = detectPitch(timeData, sampleRate, yinThreshold);

    let noteName: string | null = null;
    let targetFrequency: number | null = null;
    let fundamentalCents: number | null = null;

    if (fundamental !== null) {
      const noteInfo = frequencyToNote(fundamental);
      noteName = noteInfo.fullName;
      targetFrequency = midiToFrequency(noteInfo.midiNote);
      fundamentalCents = noteInfo.cents;
    }

    // --- Octave detection via FFT peak search (2× fundamental) ---
    let octaveFreq: number | null = null;
    let octaveCents: number | null = null;

    if (fundamental !== null) {
      const expectedOctave = fundamental * 2;
      octaveFreq = findHarmonicFrequency(freqData, expectedOctave, sampleRate, FFT_SIZE);
      octaveCents = calcCents(octaveFreq, expectedOctave);
    }

    // --- Compound fifth detection via FFT peak search (3× fundamental) ---
    let compoundFifthFreq: number | null = null;
    let compoundFifthCents: number | null = null;

    if (fundamental !== null) {
      const expectedCompoundFifth = fundamental * 3;
      compoundFifthFreq = findHarmonicFrequency(freqData, expectedCompoundFifth, sampleRate, FFT_SIZE);
      compoundFifthCents = calcCents(compoundFifthFreq, expectedCompoundFifth);
    }

    // --- Quality scoring ---
    const signalStrength = Math.round(Math.min(100, (rms / RMS_ONSET) * 100));
    const yinConfidence = Math.round(yinConf * 100);

    // Harmonic clarity bonus: how clearly the octave and fifth peaks stand out
    let clarityBonus = 0;
    if (fundamental !== null) {
      const octClarity = calcHarmonicClarity(freqData, fundamental * 2, sampleRate, FFT_SIZE);
      const cfClarity = calcHarmonicClarity(freqData, fundamental * 3, sampleRate, FFT_SIZE);
      clarityBonus = Math.round(((octClarity + cfClarity) / 2) * 20); // up to +20 pts
    }

    const overallScore = Math.min(100, Math.round(yinConfidence * 0.5 + signalStrength * 0.3 + clarityBonus));

    const quality: DetectionQuality = { yinConfidence, signalStrength, overallScore };

    // --- Golden snapshot at ~1 second after onset ---
    if (
      fundamental !== null &&
      noteName !== null &&
      fundamentalCents !== null &&
      !snapshotCapturedRef.current &&
      noteOnsetTimeRef.current !== null &&
      now - noteOnsetTimeRef.current >= SNAPSHOT_DELAY_MS
    ) {
      const noteAge = (now - noteOnsetTimeRef.current) / 1000;
      const snap: ReadingSnapshot = {
        timestamp: now,
        noteAge,
        noteName,
        frequency: fundamental,
        fundamentalCents,
        octaveCents,
        compoundFifthCents,
        rms,
        yinConfidence,
        quality: overallScore,
      };
      snapshotCapturedRef.current = true;
      setSnapshot(snap);
      setReadingLog(prev => [snap, ...prev].slice(0, MAX_LOG_ENTRIES));
    }

    setTunerData({
      fundamental: {
        frequency: fundamental,
        cents: fundamentalCents,
        noteName,
        targetFrequency,
      },
      octave: {
        frequency: octaveFreq,
        cents: octaveCents,
      },
      compoundFifth: {
        frequency: compoundFifthFreq,
        cents: compoundFifthCents,
      },
      hasSignal: true,
      quality,
    });
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6; // Moderate smoothing for stable readings
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;

      // Allocate reusable buffers
      freqDataRef.current = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
      timeDataRef.current = new Float32Array(BUFFER_SIZE) as Float32Array<ArrayBuffer>;

      // Reset note-lifecycle state
      noteActiveRef.current = false;
      noteOnsetTimeRef.current = null;
      snapshotCapturedRef.current = false;

      // Start periodic processing
      intervalRef.current = window.setInterval(processAudio, UPDATE_INTERVAL);

      setIsRunning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Microphone access failed: ${message}`);
    }
  }, [processAudio]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();

    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;

    noteActiveRef.current = false;
    noteOnsetTimeRef.current = null;
    snapshotCapturedRef.current = false;

    setIsRunning(false);
    setTunerData(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { tunerData, snapshot, readingLog, isRunning, error, start, stop };
}
