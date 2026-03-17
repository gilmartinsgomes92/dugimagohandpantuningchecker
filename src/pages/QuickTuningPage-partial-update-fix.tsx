import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

// Lock quality threshold for registering a note (0–1)
const LOCK_THRESHOLD_REGISTER = IS_IOS ? 0.62 : 0.68;
// UI reaches 100% sooner (GuitarApp-like feel)
const LOCK_THRESHOLD_DISPLAY = IS_IOS ? 0.55 : 0.60;

const OCTAVE_MAX_TARGET_CENTS = 180;
const CFIFTH_MAX_TARGET_CENTS = 220;

function getTuningStatus(absCents: number): TuningResult['status'] {
  if (absCents <= 12) return 'in-tune';
  if (absCents <= 17) return 'slightly-out-of-tune';
  return 'out-of-tune';
}

function getTuningLabel(status: TuningResult['status']): string {
  if (status === 'in-tune') return '✅ In Tune';
  if (status === 'slightly-out-of-tune') return '⚠️ Slightly Out of Tune';
  return '❌ Out of Tune';
}

function getTuningClassName(status: TuningResult['status']): string {
  if (status === 'in-tune') return 'status-in-tune';
  if (status === 'slightly-out-of-tune') return 'status-slightly-out';
  return 'status-out-of-tune';
}

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

function parseFullNoteName(noteName: string): { midiNote: number; fullName: string } | null {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return null;

  const [, pitchClass, octaveText] = match;
  const noteIndex = NOTE_INDEX[pitchClass];
  if (noteIndex === undefined) return null;

  const octave = Number(octaveText);
  if (!Number.isFinite(octave)) return null;

  return {
    midiNote: (octave + 1) * 12 + noteIndex,
    fullName: `${pitchClass}${octave}`,
  };
}

function trimmedMean(freqs: number[]): number | null {
  if (freqs.length === 0) return null;
  const sorted = [...freqs].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * 0.25);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return trimmed.length > 0
    ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
    : sorted[Math.floor((sorted.length - 1) / 2)];
}

function calculateCents(freq: number, targetFreq: number): number {
  return 1200 * Math.log2(freq / targetFreq);
}

const QuickTuningPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening, debugInfo } = useAudioProcessor();

  const notesCount = state.notesCount ?? 0;
  const noteIndex = state.currentNoteIndex;

  const stableFrequencies = useRef<number[]>([]);
  const stableOctaveFreqs = useRef<number[]>([]);
  const stableCFifthFreqs = useRef<number[]>([]);
  const collectingNoteName = useRef<string | null>(null);
  const justRegistered = useRef(false);

  // Tracks full note names already registered this session to prevent duplicates.
  const registeredNoteNames = useRef<Set<string>>(new Set());

  const resetStabilityState = useCallback(() => {
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
  }, []);

  const registeredCount = state.tuningResults.filter((r) => r.status !== 'pending').length;

  useEffect(() => {
    if (!state.notesCount) navigate('/notes-count-selection');
  }, [state.notesCount, navigate]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  useEffect(() => {
    if (!isListening) {
      void startListening();
    }
  }, [isListening, startListening]);

  useEffect(() => {
    if (notesCount > 0 && registeredCount >= notesCount) {
      stopListening();
      navigate('/results');
    }
  }, [registeredCount, notesCount, stopListening, navigate]);

  const updateRegisteredNotePartials = useCallback((noteName: string) => {
    const parsed = parseFullNoteName(noteName);
    if (parsed === null) return;

    const measuredOctave = trimmedMean(stableOctaveFreqs.current) ?? result.octaveFrequency;
    const measuredCFifth = trimmedMean(stableCFifthFreqs.current) ?? result.compoundFifthFrequency;

    const targetOctaveFreq = midiToFrequency(parsed.midiNote + 12);
    const targetCompoundFifthFreq = midiToFrequency(parsed.midiNote + 19);

    const octaveCents =
      measuredOctave !== null &&
      Math.abs(calculateCents(measuredOctave, targetOctaveFreq)) <= OCTAVE_MAX_TARGET_CENTS
        ? calculateCents(measuredOctave, targetOctaveFreq)
        : null;

    const compoundFifthCents =
      measuredCFifth !== null &&
      Math.abs(calculateCents(measuredCFifth, targetCompoundFifthFreq)) <= CFIFTH_MAX_TARGET_CENTS
        ? calculateCents(measuredCFifth, targetCompoundFifthFreq)
        : null;

    const patch: Partial<TuningResult> = {};
    if (octaveCents !== null) {
      patch.octaveFreq = measuredOctave ?? undefined;
      patch.octaveCents = octaveCents;
    }
    if (compoundFifthCents !== null) {
      patch.compoundFifthFreq = measuredCFifth ?? undefined;
      patch.compoundFifthCents = compoundFifthCents;
    }

    if (Object.keys(patch).length > 0) {
      dispatch({ type: 'UPDATE_TUNING_RESULT_BY_NOTE_NAME', payload: { noteName, patch } });
    }
  }, [dispatch, result.compoundFifthFrequency, result.octaveFrequency]);

  const registerNote = useCallback(() => {
    if (justRegistered.current) return;

    const detectedFreq = trimmedMean(stableFrequencies.current) ?? result.frequency;
    const detectedNoteName = result.noteName;
    if (detectedFreq === null || detectedNoteName === null) return;

    const parsedDetectedNote = parseFullNoteName(detectedNoteName);
    if (parsedDetectedNote === null) return;

    const noteName = parsedDetectedNote.fullName;
    const midiNote = parsedDetectedNote.midiNote;
    const targetFrequency = midiToFrequency(midiNote);
    const cents = calculateCents(detectedFreq, targetFrequency);

    if (registeredNoteNames.current.has(noteName)) {
      updateRegisteredNotePartials(noteName);
      resetStabilityState();
      return;
    }

    justRegistered.current = true;
    registeredNoteNames.current.add(noteName);

    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);

    const rawOctave = trimmedMean(stableOctaveFreqs.current) ?? result.octaveFrequency;
    const rawOctaveCents =
      rawOctave !== null ? calculateCents(rawOctave, targetOctaveFreq) : null;
    const octaveFreq =
      rawOctave !== null && rawOctaveCents !== null && Math.abs(rawOctaveCents) <= OCTAVE_MAX_TARGET_CENTS
        ? rawOctave
        : undefined;
    const octaveCents = octaveFreq !== undefined ? calculateCents(octaveFreq, targetOctaveFreq) : undefined;

    const rawCFifth = trimmedMean(stableCFifthFreqs.current) ?? result.compoundFifthFrequency;
    const rawCFifthCents =
      rawCFifth !== null ? calculateCents(rawCFifth, targetCompoundFifthFreq) : null;
    const compoundFifthFreq =
      rawCFifth !== null && rawCFifthCents !== null && Math.abs(rawCFifthCents) <= CFIFTH_MAX_TARGET_CENTS
        ? rawCFifth
        : undefined;
    const compoundFifthCents =
      compoundFifthFreq !== undefined ? calculateCents(compoundFifthFreq, targetCompoundFifthFreq) : undefined;

    const absCents = Math.abs(cents);
    const status = getTuningStatus(absCents);

    const payload: TuningResult = {
      noteName,
      targetFrequency,
      detectedFrequency: detectedFreq,
      cents,
      status,
      compoundFifthFreq,
      compoundFifthCents,
      octaveFreq,
      octaveCents,
    };

    dispatch({ type: 'ADD_TUNING_RESULT', payload });
    dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });

    collectingNoteName.current = null;
    resetStabilityState();

    setTimeout(() => {
      resetStabilityState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [result, noteIndex, dispatch, resetStabilityState, updateRegisteredNotePartials]);

  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const isLockedForRegister = lockQuality >= LOCK_THRESHOLD_REGISTER;
  const shouldRegister = stabilityPct >= 98 || isLockedForRegister;

  useEffect(() => {
    if (!isListening || justRegistered.current) {
      resetStabilityState();
      return;
    }

    if (result.frequency === null || result.noteName === null) return;

    if (collectingNoteName.current !== result.noteName) {
      collectingNoteName.current = result.noteName;
      resetStabilityState();
    }

    const lockQ = result.lockQuality ?? 0;
    const hasUsefulPartial = result.octaveFrequency !== null || result.compoundFifthFrequency !== null;

    if (lockQ >= 0.55) {
      stableFrequencies.current.push(result.frequency);
      if (result.octaveFrequency !== null) stableOctaveFreqs.current.push(result.octaveFrequency);
      if (result.compoundFifthFrequency !== null) {
        stableCFifthFreqs.current.push(result.compoundFifthFrequency);
      }
    }

    if (registeredNoteNames.current.has(result.noteName)) {
      if (hasUsefulPartial) updateRegisteredNotePartials(result.noteName);
      return;
    }

    if (shouldRegister && stableFrequencies.current.length >= 4) {
      registerNote();
    }
  }, [result, isListening, shouldRegister, registerNote, resetStabilityState, updateRegisteredNotePartials]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;

  return (
    <>
      <div className="page quick-tuning-page">
        <div className="page-header">
          <div className="tuning-progress-bar">
            <div className="tuning-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="progress-label">
            {registeredCount} of {notesCount} notes registered
          </p>
        </div>

        <main className="page-content tune-content">
          <div className="quick-tuning-card">
            <p className="listening-label">
              {isListening ? 'Listening…' : 'Starting microphone…'}
            </p>

            <div className="gauge-wrap">
              <CentsGauge cents={result.cents} />
            </div>

            <p className="stability-label">Stability: {stabilityPct}%</p>

            <div className="live-note-card">
              <div className="live-note-name">{result.noteName ?? '—'}</div>
              <div className="live-note-cents" style={{ color: statusColor }}>
                {result.cents !== null ? formatCents(result.cents) : '—'}
              </div>
              {currentStatus && (
                <div className={`live-note-status ${getTuningClassName(currentStatus)}`}>
                  {getTuningLabel(currentStatus)}
                </div>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}

            {DEBUG && (
              <pre className="debug-panel">
                {JSON.stringify(
                  {
                    result,
                    debugInfo,
                    stableFundFrames: stableFrequencies.current.length,
                    stableOctFrames: stableOctaveFreqs.current.length,
                    stableCFifthFrames: stableCFifthFreqs.current.length,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
          </div>
        </main>
      </div>
    </>
  );
};

export default QuickTuningPage;
