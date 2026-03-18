import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;
const ADAPTIVE_RESTRIKE_MAX = 3;

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

// Lock quality threshold for registering a note (0–1)
const LOCK_THRESHOLD_REGISTER = IS_IOS ? 0.62 : 0.68;
// UI reaches 100% sooner (GuitarApp-like feel)
const LOCK_THRESHOLD_DISPLAY = IS_IOS ? 0.55 : 0.60;

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



type PendingAdaptiveStrike = {
  noteName: string;
  midiNote: number;
  strikeCount: number;
  targetFrequency: number;
  targetOctaveFreq: number;
  targetCompoundFifthFreq: number;
  detectedFreqs: number[];
  octaveFreqs: number[];
  compoundFifthFreqs: number[];
};

function trimmedMean(freqs: number[]): number | null {
  if (freqs.length === 0) return null;
  const sorted = [...freqs].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * 0.25);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return trimmed.length > 0
    ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
    : sorted[Math.floor((sorted.length - 1) / 2)];
}

function appendUnique(source: number[], incoming: number[]): number[] {
  if (incoming.length === 0) return [...source];
  return [...source, ...incoming];
}

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

const QuickTuningPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening, debugInfo } = useAudioProcessor();

  const notesCount = state.notesCount ?? 0;
  const noteIndex = state.currentNoteIndex;

  const stableFrequencies = useRef<number[]>([]);
  const stableOctaveFreqs = useRef<number[]>([]);
  const stableCFifthFreqs = useRef<number[]>([]);
  const justRegistered = useRef(false);
  const collectingNoteName = useRef<string | null>(null);
  const pendingAdaptiveStrikeRef = useRef<PendingAdaptiveStrike | null>(null);
  const [adaptiveRetryInfo, setAdaptiveRetryInfo] = useState<{ noteName: string; strikeCount: number } | null>(null);

  // Tracks full note names already registered this session to prevent duplicates.
  const registeredNoteNames = useRef<Set<string>>(new Set());

  const resetStabilityState = useCallback(() => {
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
    collectingNoteName.current = null;
  }, []);

  const registeredCount = state.tuningResults.filter((r) => r.status !== 'pending').length;

  useEffect(() => {
    if (!state.notesCount) navigate('/notes-count-selection');
  }, [state.notesCount, navigate]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  // Auto-start listening when the page loads
useEffect(() => {
  if (!isListening) {
    void startListening();
  }
}, [isListening, startListening]);

  // Navigate to results when all notes are registered
  useEffect(() => {
    if (notesCount > 0 && registeredCount >= notesCount) {
      const timeout = setTimeout(() => {
        stopListening();
        navigate('/results');
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [registeredCount, notesCount, stopListening, navigate]);

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

    if (registeredNoteNames.current.has(noteName)) {
      resetStabilityState();
      return;
    }

    const pending = pendingAdaptiveStrikeRef.current;
    if (pending !== null && pending.noteName !== noteName) {
      return;
    }

    const OCTAVE_MAX_TARGET_CENTS = 180;
    const CFIFTH_MAX_TARGET_CENTS = 220;

    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);

    const mergedStrike: PendingAdaptiveStrike = pending
      ? {
          ...pending,
          strikeCount: pending.strikeCount + 1,
          detectedFreqs: appendUnique(pending.detectedFreqs, stableFrequencies.current),
          octaveFreqs: appendUnique(pending.octaveFreqs, stableOctaveFreqs.current),
          compoundFifthFreqs: appendUnique(
            pending.compoundFifthFreqs,
            stableCFifthFreqs.current,
          ),
        }
      : {
          noteName,
          midiNote,
          strikeCount: 1,
          targetFrequency,
          targetOctaveFreq,
          targetCompoundFifthFreq,
          detectedFreqs: [...stableFrequencies.current],
          octaveFreqs: [...stableOctaveFreqs.current],
          compoundFifthFreqs: [...stableCFifthFreqs.current],
        };

    const mergedDetectedFreq = trimmedMean(mergedStrike.detectedFreqs) ?? detectedFreq;
    const cents = 1200 * Math.log2(mergedDetectedFreq / targetFrequency);

    const rawOctave = trimmedMean(mergedStrike.octaveFreqs);
    const rawOctaveCents =
      rawOctave !== null ? 1200 * Math.log2(rawOctave / targetOctaveFreq) : null;
    const useMeasuredOctave =
      rawOctave !== null &&
      rawOctaveCents !== null &&
      Math.abs(rawOctaveCents) <= OCTAVE_MAX_TARGET_CENTS;
    const octaveFreq = useMeasuredOctave ? rawOctave : null;
    const octaveCents =
      octaveFreq !== null ? 1200 * Math.log2(octaveFreq / targetOctaveFreq) : null;

    const rawCFifth = trimmedMean(mergedStrike.compoundFifthFreqs);
    const rawCFifthCents =
      rawCFifth !== null ? 1200 * Math.log2(rawCFifth / targetCompoundFifthFreq) : null;
    const useMeasuredCFifth =
      rawCFifth !== null &&
      rawCFifthCents !== null &&
      Math.abs(rawCFifthCents) <= CFIFTH_MAX_TARGET_CENTS;
    const compoundFifthFreq = useMeasuredCFifth ? rawCFifth : null;
    const compoundFifthCents =
      compoundFifthFreq !== null
        ? 1200 * Math.log2(compoundFifthFreq / targetCompoundFifthFreq)
        : null;

    const missingPartials = Number(!useMeasuredOctave) + Number(!useMeasuredCFifth);
    const shouldRequestRestrike =
      missingPartials > 0 && mergedStrike.strikeCount < ADAPTIVE_RESTRIKE_MAX;

    justRegistered.current = true;
    collectingNoteName.current = noteName;

    if (shouldRequestRestrike) {
      pendingAdaptiveStrikeRef.current = mergedStrike;
      setAdaptiveRetryInfo({ noteName, strikeCount: mergedStrike.strikeCount });

      setTimeout(() => {
        resetStabilityState();
        justRegistered.current = false;
      }, REGISTRATION_COOLDOWN_MS);
      return;
    }

    pendingAdaptiveStrikeRef.current = null;
    setAdaptiveRetryInfo(null);
    registeredNoteNames.current.add(noteName);

    const absCents = Math.abs(cents);
    const status = getTuningStatus(absCents);

    const payload: TuningResult = {
      noteName,
      targetFrequency,
      detectedFrequency: mergedDetectedFreq,
      cents,
      status,
      compoundFifthFreq: compoundFifthFreq ?? undefined,
      compoundFifthCents: compoundFifthCents ?? undefined,
      octaveFreq: octaveFreq ?? undefined,
      octaveCents: octaveCents ?? undefined,
    };

    dispatch({ type: 'ADD_TUNING_RESULT', payload });
    dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });

    setTimeout(() => {
      resetStabilityState();
      justRegistered.current = false;
      collectingNoteName.current = null;
    }, REGISTRATION_COOLDOWN_MS);
  }, [result, noteIndex, dispatch, resetStabilityState]);

    // Stability ring shows the audio lock quality (0–100%)
  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const isLockedForRegister = lockQuality >= LOCK_THRESHOLD_REGISTER;
  const shouldRegister = stabilityPct >= 98 || isLockedForRegister;

  // Fast lock flow: use lockQuality from the audio hook.
  // Collect immediately when lock is decent; register when lock is strong.
  useEffect(() => {
    if (!isListening) {
      resetStabilityState();
      return;
    }

    if (result.frequency === null || result.noteName === null) return;

    const isAlreadyRegistered = registeredNoteNames.current.has(result.noteName);
    const pendingAdaptive = pendingAdaptiveStrikeRef.current;

    if (pendingAdaptive !== null && result.noteName !== pendingAdaptive.noteName) {
      return;
    }

    if (justRegistered.current) {
      // During cooldown, keep collecting only for the same note that was just registered.
      if (collectingNoteName.current !== result.noteName) {
        return;
      }
    } else {
      // Outside cooldown, clear buffers only when the detected note actually changes.
      if (
        collectingNoteName.current !== null &&
        collectingNoteName.current !== result.noteName
      ) {
        stableFrequencies.current = [];
        stableOctaveFreqs.current = [];
        stableCFifthFreqs.current = [];
      }
      collectingNoteName.current = result.noteName;
    }

    const lockQ = result.lockQuality ?? 0;

// Keep the fundamental strict.
if (lockQ >= 0.55) {
  stableFrequencies.current.push(result.frequency);
}

// Do NOT gate partial accumulation by the same fundamental lock threshold.
// The hook already validates octave / compound fifth candidates before exposing them.
// Let the page collect any non-null partials and let the trimmed mean decide later.
if (result.octaveFrequency !== null) {
  stableOctaveFreqs.current.push(result.octaveFrequency);
}

if (result.compoundFifthFrequency !== null) {
  stableCFifthFreqs.current.push(result.compoundFifthFrequency);
}

    if (isAlreadyRegistered) {
      const trimmedMean = (freqs: number[]): number | null => {
        if (freqs.length === 0) return null;
        const sorted = [...freqs].sort((a, b) => a - b);
        const trimCount = Math.floor(sorted.length * 0.25);
        const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
        return trimmed.length > 0
          ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
          : sorted[Math.floor((sorted.length - 1) / 2)];
      };

      const parsedDetectedNote = parseFullNoteName(result.noteName);
      if (!parsedDetectedNote) return;

      const midiNote = parsedDetectedNote.midiNote;
      const targetOctaveFreq = midiToFrequency(midiNote + 12);
      const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);

      const OCTAVE_MAX_TARGET_CENTS = 180;
      const CFIFTH_MAX_TARGET_CENTS = 220;

      const rawOctave = trimmedMean(stableOctaveFreqs.current);
      const rawOctaveCents =
        rawOctave !== null ? 1200 * Math.log2(rawOctave / targetOctaveFreq) : null;
      const useMeasuredOctave =
        rawOctave !== null &&
        rawOctaveCents !== null &&
        Math.abs(rawOctaveCents) <= OCTAVE_MAX_TARGET_CENTS;

      const rawCFifth = trimmedMean(stableCFifthFreqs.current);
      const rawCFifthCents =
        rawCFifth !== null ? 1200 * Math.log2(rawCFifth / targetCompoundFifthFreq) : null;
      const useMeasuredCFifth =
        rawCFifth !== null &&
        rawCFifthCents !== null &&
        Math.abs(rawCFifthCents) <= CFIFTH_MAX_TARGET_CENTS;

      if (useMeasuredOctave || useMeasuredCFifth) {
        dispatch({
          type: 'UPDATE_TUNING_RESULT_PARTIALS',
          payload: {
            noteName: result.noteName,
            octaveFreq: useMeasuredOctave ? rawOctave ?? undefined : undefined,
            octaveCents: useMeasuredOctave ? rawOctaveCents ?? undefined : undefined,
            compoundFifthFreq: useMeasuredCFifth ? rawCFifth ?? undefined : undefined,
            compoundFifthCents: useMeasuredCFifth ? rawCFifthCents ?? undefined : undefined,
          },
        });
      }

      return;
    }

    if (shouldRegister && !justRegistered.current) {
      registerNote();
    }
  }, [result, isListening, shouldRegister, registerNote, resetStabilityState, dispatch]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;
  const adaptiveHelpText = useMemo(() => {
    if (!adaptiveRetryInfo) return null;
    const remaining = ADAPTIVE_RESTRIKE_MAX - adaptiveRetryInfo.strikeCount;
    if (remaining <= 0) return null;
    return `Replay ${adaptiveRetryInfo.noteName} ${remaining} more ${remaining === 1 ? 'time' : 'times'} for a fuller partial reading`;
  }, [adaptiveRetryInfo]);

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

        <div className="note-prompt-card">
          <div className="note-zone-label">Play any note on your handpan</div>
          <div className="note-prompt-name" style={{ color: statusColor }}>
            {result.noteName ?? '—'}
          </div>
          {result.frequency !== null && (
            <div className="note-prompt-freq">{result.frequency.toFixed(2)} Hz</div>
          )}
          <p className="note-instruction">Hold the note ringing — it will be auto-registered</p>
          {adaptiveHelpText && <p className="note-instruction">{adaptiveHelpText}</p>}
        </div>

        <div className="tuning-display">
          <div className="quick-stability-ring">
            <svg viewBox="0 0 100 100" className="stability-svg">
              <circle cx="50" cy="50" r="44" className="stability-track" />
              <circle
                cx="50"
                cy="50"
                r="44"
                className="stability-fill"
                style={{
                  strokeDasharray: `${stabilityPct * 2.764} ${276.4}`,
                  stroke: statusColor,
                }}
              />
            </svg>
            <div className="stability-center">
              {stabilityPct > 0 ? (
                <span className="stability-pct" style={{ color: statusColor }}>
                  {stabilityPct}%
                </span>
              ) : (
                <span className="stability-idle">🎵</span>
              )}
            </div>
          </div>

          <div className="tuning-readings">
            {result.frequency !== null ? (
              <>
                <div className="reading-row">
                  <span className="reading-label">Detected:</span>
                  <span className="reading-value">{result.frequency.toFixed(2)} Hz</span>
                </div>
                <div className="reading-row">
                  <span className="reading-label">Deviation:</span>
                  <span className="reading-value" style={{ color: statusColor }}>
                    {result.cents !== null ? formatCents(result.cents) : '—'}
                  </span>
                </div>
                {currentStatus && (
                  <div className={`tuning-status-badge ${getTuningClassName(currentStatus)}`}>
                    {getTuningLabel(currentStatus)}
                  </div>
                )}
              </>
            ) : (
              <div className="listening-placeholder">
                {isListening ? <span className="listening-anim">🎵 Listening…</span> : <span>Starting microphone…</span>}
              </div>
            )}
          </div>
        </div>

        <CentsGauge cents={result.cents} label="Cents deviation" />

        {error && <div className="error-banner">{error}</div>}

        {registeredCount > 0 && (
          <div className="registered-notes-list">
            <h4 className="registered-notes-title">Registered Notes</h4>
            {state.tuningResults.slice(0, registeredCount).map((r, i) => {
              const color = r.cents !== null ? centsToColor(r.cents) : '#555';
              return (
                <div key={i} className="registered-note-row">
                  <span className="reg-note-name">{r.noteName}</span>
                  <span className="reg-note-cents" style={{ color }}>
                    {r.cents !== null ? formatCents(r.cents) : '—'}
                  </span>
                  <span
                    className={`reg-note-status ${getTuningClassName(
                      r.status as TuningResult['status']
                    )}`}
                  >
                    {r.status === 'in-tune' ? '✅' : r.status === 'slightly-out-of-tune' ? '⚠️' : '❌'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {DEBUG && (
          <div className="debug-panel">
            <h4>Debug</h4>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}

        <div className="bottom-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              stopListening();
              navigate(-1);
            }}
          >
            ← Back
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              stopListening();
              navigate('/results');
            }}
            disabled={registeredCount === 0}
          >
            View Results →
          </button>
        </div>
      </div>
    </>
  );
};

export default QuickTuningPage;
