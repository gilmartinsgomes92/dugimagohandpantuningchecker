/**
 * useTuner hook – main state management for the tuner page.
 *
 * Coordinates AudioCapture, HarmonicAnalyzer, and TuningCalculator services
 * to provide a complete recording/analysis loop. Integrates with useTuningStorage
 * to persist completed measurements.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioCapture } from '../services/audio/audioCapture';
import type { AudioCaptureBuffers } from '../services/audio/audioCapture';
import { HarmonicAnalyzer } from '../services/audio/harmonicAnalyzer';
import { TuningCalculator } from '../services/audio/tuningCalculator';
import { useTuningStorage } from './useTuningStorage';
import type { TuningMeasurement, FrequencyReading } from '../types/tuning';

export interface TunerLiveResult {
  noteName: string | null;
  fundamentalFreq: number | null;
  fundamentalCents: number | null;
  octaveFreq: number | null;
  octaveCents: number | null;
  fifthFreq: number | null;
  fifthCents: number | null;
  confidence: number;
  /** Raw dB magnitude spectrum for the visualiser. */
  spectrum: Float32Array | null;
}

const EMPTY_RESULT: TunerLiveResult = {
  noteName: null,
  fundamentalFreq: null,
  fundamentalCents: null,
  octaveFreq: null,
  octaveCents: null,
  fifthFreq: null,
  fifthCents: null,
  confidence: 0,
  spectrum: null,
};

const FFT_SIZE = 4096;

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useTuner(handpanName: string = 'My Handpan') {
  const [isRecording, setIsRecording] = useState(false);
  const [liveResult, setLiveResult] = useState<TunerLiveResult>(EMPTY_RESULT);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<AudioCapture | null>(null);
  const analyzerRef = useRef<HarmonicAnalyzer | null>(null);
  const calculatorRef = useRef<TuningCalculator>(new TuningCalculator());
  const sessionIdRef = useRef<string>(generateSessionId());

  const { sessions, saveMeasurement, deleteSession, clearAll, exportJSON, exportCSV } =
    useTuningStorage();

  const handleFrame = useCallback(
    (buffers: AudioCaptureBuffers) => {
      const analyzer = analyzerRef.current;
      if (!analyzer) return;

      const readings = analyzer.analyse(buffers.timeDomain, buffers.frequencyDomain);
      const spectrum = buffers.frequencyDomain.slice();

      if (readings === null) {
        setLiveResult(prev => ({ ...prev, spectrum, confidence: 0 }));
        return;
      }

      const calc = calculatorRef.current;
      const noteInfo = calc.calculate(readings.fundamental.frequency);
      const octaveCents = calc.deviationCents(
        readings.octave.frequency,
        readings.fundamental.frequency * 2
      );
      const fifthCents = calc.deviationCents(
        readings.fifth.frequency,
        readings.fundamental.frequency * 3
      );

      setLiveResult({
        noteName: noteInfo.noteName,
        fundamentalFreq: readings.fundamental.frequency,
        fundamentalCents: noteInfo.cents,
        octaveFreq: readings.octave.frequency,
        octaveCents,
        fifthFreq: readings.fifth.frequency,
        fifthCents,
        confidence: readings.fundamental.confidence,
        spectrum,
      });
    },
    []
  );

  const startRecording = useCallback(async () => {
    setError(null);
    const capture = new AudioCapture(FFT_SIZE);
    captureRef.current = capture;

    try {
      // Start the capture first to get the actual sample rate
      await capture.start(handleFrame);
      // AudioCapture.start() sets up the AudioContext; we can now build the analyzer
      // Rebuild analyzer after context is ready to get correct sampleRate
      analyzerRef.current = new HarmonicAnalyzer(
        capture.sampleRate,
        FFT_SIZE
      );
      setIsRecording(true);
      sessionIdRef.current = generateSessionId();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      capture.stop();
      captureRef.current = null;
    }
  }, [handleFrame]);

  const stopRecording = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    analyzerRef.current = null;
    setIsRecording(false);
    setLiveResult(EMPTY_RESULT);
  }, []);

  /**
   * Snapshot the current live readings and persist them as a TuningMeasurement.
   * The caller must provide the note name expected for this measurement.
   */
  const saveMeasurementNow = useCallback(
    (note: string) => {
      const r = liveResult;
      if (r.fundamentalFreq === null) return;

      const emptyReading: FrequencyReading = { frequency: 0, deviation: 0, confidence: 0 };

      const measurement: TuningMeasurement = {
        timestamp: new Date(),
        handpan: handpanName,
        note,
        fundamental: {
          frequency: r.fundamentalFreq,
          deviation: r.fundamentalCents ?? 0,
          confidence: r.confidence,
        },
        octave: r.octaveFreq !== null
          ? { frequency: r.octaveFreq, deviation: r.octaveCents ?? 0, confidence: r.confidence * 0.9 }
          : emptyReading,
        fifth: r.fifthFreq !== null
          ? { frequency: r.fifthFreq, deviation: r.fifthCents ?? 0, confidence: r.confidence * 0.85 }
          : emptyReading,
      };

      saveMeasurement(sessionIdRef.current, handpanName, measurement);
    },
    [liveResult, handpanName, saveMeasurement]
  );

  // Clean up on unmount
  useEffect(() => () => { captureRef.current?.stop(); }, []);

  return {
    isRecording,
    liveResult,
    error,
    sessions,
    startRecording,
    stopRecording,
    saveMeasurementNow,
    deleteSession,
    clearAll,
    exportJSON,
    exportCSV,
  };
}
