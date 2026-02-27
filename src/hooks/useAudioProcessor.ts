/**
 * React hook for real-time audio processing.
 *
 * Uses:
 * - YIN algorithm for accurate fundamental frequency detection
 * - Web Audio AnalyserNode (32768-bin FFT) with parabolic interpolation
 *   for octave (2×) and compound fifth (3×) harmonic analysis
 *
 * Update rate: ~20 Hz (every 50ms)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPitch, computeRMS } from '../utils/yin';
import { findHarmonicFrequency, validateFundamental, calcHzDeviation } from '../utils/harmonicAnalyzer';
import { frequencyToNote, midiToFrequency } from '../utils/musicUtils';
import type { TunerData } from '../types';

const FFT_SIZE = 32768;      // Large FFT for good harmonic resolution (~1.35 Hz/bin @ 44100)
const BUFFER_SIZE = 16384;   // YIN buffer (~371ms @ 44100, ~54 cycles at 145 Hz)
const UPDATE_INTERVAL = 50;  // ms between tuner updates
const RMS_THRESHOLD = 0.003; // Minimum signal level to attempt detection
const MAX_FREQUENCY_RATIO = 2.0; // Maximum allowed ratio between consecutive detections

export function useAudioProcessor() {
  const [tunerData, setTunerData] = useState<TunerData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  const freqDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const prevFundamentalRef = useRef<number | null>(null);
  const pendingFundamentalRef = useRef<number | null>(null);
  const pendingCountRef = useRef<number>(0);

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

    // RMS check - gate on silence
    const rms = computeRMS(timeData);
    if (rms < RMS_THRESHOLD) {
      prevFundamentalRef.current = null;
      pendingFundamentalRef.current = null;
      pendingCountRef.current = 0;
      setTunerData({
        fundamental: { frequency: null, hzDeviation: null, noteName: null, targetFrequency: null },
        octave: { frequency: null, hzDeviation: null },
        compoundFifth: { frequency: null, hzDeviation: null },
        hasSignal: false,
      });
      return;
    }

    // --- Fundamental detection via YIN ---
    let fundamental = detectPitch(timeData, sampleRate);

    // --- FFT cross-validation: verify YIN result against frequency domain ---
    if (fundamental !== null) {
      const fftConfirmed = findHarmonicFrequency(freqData, fundamental, sampleRate, FFT_SIZE);
      if (fftConfirmed !== null) {
        // Harmonic validation: check if a sub-octave might be the true fundamental
        fundamental = validateFundamental(fftConfirmed, freqData, sampleRate, FFT_SIZE);
      } else {
        // FFT doesn't confirm YIN result — try octave-up correction (subharmonic fix)
        const octaveUp = fundamental * 2;
        if (octaveUp <= 4200) { // 4200 Hz is the upper limit of the musical range (see yin.ts)
          const octaveConfirmed = findHarmonicFrequency(freqData, octaveUp, sampleRate, FFT_SIZE);
          fundamental = octaveConfirmed !== null ? octaveConfirmed : null;
        } else {
          fundamental = null;
        }
      }
    }

    // --- Signal continuity: require 2 consecutive detections to accept a large frequency jump ---
    // (prevents spurious single-frame octave errors while allowing genuine note changes)
    if (fundamental !== null && prevFundamentalRef.current !== null) {
      const ratio = fundamental / prevFundamentalRef.current;
      if (ratio > MAX_FREQUENCY_RATIO || ratio < 1 / MAX_FREQUENCY_RATIO) {
        // Large jump: check if this is the same "pending" candidate as last frame
        if (pendingFundamentalRef.current !== null) {
          const pendingRatio = fundamental / pendingFundamentalRef.current;
          if (pendingRatio <= MAX_FREQUENCY_RATIO && pendingRatio >= 1 / MAX_FREQUENCY_RATIO) {
            pendingCountRef.current += 1;
          } else {
            pendingFundamentalRef.current = fundamental;
            pendingCountRef.current = 1;
          }
        } else {
          pendingFundamentalRef.current = fundamental;
          pendingCountRef.current = 1;
        }
        // Accept the new frequency only after 2 consecutive confirmations
        if (pendingCountRef.current < 2) {
          fundamental = prevFundamentalRef.current;
        } else {
          pendingFundamentalRef.current = null;
          pendingCountRef.current = 0;
        }
      } else {
        // Normal continuity — no jump
        pendingFundamentalRef.current = null;
        pendingCountRef.current = 0;
      }
    }
    prevFundamentalRef.current = fundamental;

    let noteName: string | null = null;
    let targetFrequency: number | null = null;
    let fundamentalHzDeviation: number | null = null;

    if (fundamental !== null) {
      const noteInfo = frequencyToNote(fundamental);
      noteName = noteInfo.fullName;
      targetFrequency = midiToFrequency(noteInfo.midiNote);
      fundamentalHzDeviation = fundamental - targetFrequency; // Hz deviation from nearest semitone
    }

    // --- Octave detection via FFT peak search (2× fundamental) ---
    let octaveFreq: number | null = null;
    let octaveHzDeviation: number | null = null;

    if (fundamental !== null) {
      const expectedOctave = fundamental * 2;
      octaveFreq = findHarmonicFrequency(freqData, expectedOctave, sampleRate, FFT_SIZE);
      // Hz deviation from ideal 2:1 ratio
      octaveHzDeviation = calcHzDeviation(octaveFreq, expectedOctave);
    }

    // --- Compound fifth detection via FFT peak search (3× fundamental) ---
    // The compound fifth (P12) is the 3rd harmonic, frequency ratio 3:1
    let compoundFifthFreq: number | null = null;
    let compoundFifthHzDeviation: number | null = null;

    if (fundamental !== null) {
      const expectedCompoundFifth = fundamental * 3;
      compoundFifthFreq = findHarmonicFrequency(freqData, expectedCompoundFifth, sampleRate, FFT_SIZE);
      // Hz deviation from ideal 3:1 ratio
      compoundFifthHzDeviation = calcHzDeviation(compoundFifthFreq, expectedCompoundFifth);
    }

    setTunerData({
      fundamental: {
        frequency: fundamental,
        hzDeviation: fundamentalHzDeviation,
        noteName,
        targetFrequency,
      },
      octave: {
        frequency: octaveFreq,
        hzDeviation: octaveHzDeviation,
      },
      compoundFifth: {
        frequency: compoundFifthFreq,
        hzDeviation: compoundFifthHzDeviation,
      },
      hasSignal: true,
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
    prevFundamentalRef.current = null;
    pendingFundamentalRef.current = null;
    pendingCountRef.current = 0;

    setIsRunning(false);
    setTunerData(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { tunerData, isRunning, error, start, stop };
}
