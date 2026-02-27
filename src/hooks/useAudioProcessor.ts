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
import { findHarmonicFrequency, calcCents } from '../utils/harmonicAnalyzer';
import { frequencyToNote, midiToFrequency } from '../utils/musicUtils';
import type { TunerData } from '../types';

const FFT_SIZE = 32768;      // Large FFT for good harmonic resolution (~1.35 Hz/bin @ 44100)
const BUFFER_SIZE = 8192;    // YIN buffer (~186ms @ 44100)
const UPDATE_INTERVAL = 50;  // ms between tuner updates
const RMS_THRESHOLD = 0.003; // Minimum signal level to attempt detection

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
      setTunerData({
        fundamental: { frequency: null, cents: null, noteName: null, targetFrequency: null },
        octave: { frequency: null, cents: null },
        compoundFifth: { frequency: null, cents: null },
        hasSignal: false,
      });
      return;
    }

    // --- Fundamental detection via YIN ---
    const fundamental = detectPitch(timeData, sampleRate);

    let noteName: string | null = null;
    let targetFrequency: number | null = null;
    let fundamentalCents: number | null = null;

    if (fundamental !== null) {
      const noteInfo = frequencyToNote(fundamental);
      noteName = noteInfo.fullName;
      targetFrequency = midiToFrequency(noteInfo.midiNote);
      fundamentalCents = noteInfo.cents; // cents from nearest semitone
    }

    // --- Octave detection via FFT peak search (2× fundamental) ---
    let octaveFreq: number | null = null;
    let octaveCents: number | null = null;

    if (fundamental !== null) {
      const expectedOctave = fundamental * 2;
      octaveFreq = findHarmonicFrequency(freqData, expectedOctave, sampleRate, FFT_SIZE);
      // Cents deviation from ideal 2:1 ratio
      octaveCents = calcCents(octaveFreq, expectedOctave);
    }

    // --- Compound fifth detection via FFT peak search (3× fundamental) ---
    // The compound fifth (P12) is the 3rd harmonic, frequency ratio 3:1
    let compoundFifthFreq: number | null = null;
    let compoundFifthCents: number | null = null;

    if (fundamental !== null) {
      const expectedCompoundFifth = fundamental * 3;
      compoundFifthFreq = findHarmonicFrequency(freqData, expectedCompoundFifth, sampleRate, FFT_SIZE);
      // Cents deviation from ideal 3:1 ratio
      compoundFifthCents = calcCents(compoundFifthFreq, expectedCompoundFifth);
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
