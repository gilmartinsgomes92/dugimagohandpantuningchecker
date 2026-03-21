import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;
const NOTE_RELEASE_MS = 260;
const MIN_FREEZE_FRAMES = 2;
const PARTIAL_MIN_CONSECUTIVE_FRAMES = 2;
const PARTIAL_MAX_JUMP_CENTS = 70;

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

function centsBetween(freqA: number, freqB: number): number {
  return 1200 * Math.log2(freqA / freqB);
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

type PartialTracker = {
  accepted: number[];
  candidate: number[];
  candidateCenter: number | null;
  consecutive: number;
};

function resetPartialTracker(tracker: PartialTracker): void {
  tracker.accepted = [];
  tracker.candidate = [];
  tracker.candidateCenter = null;
  tracker.consecutive = 0;
}

function pushPersistentPartialSample(tracker: PartialTracker, value: number): void {
  if (tracker.candidateCenter === null) {
    tracker.candidate = [value];
    tracker.candidateCenter = value;
    tracker.consecutive = 1;
    return;
  }

  const jumpCents = Math.abs(centsBetween(value, tracker.candidateCenter));
  if (jumpCents <= PARTIAL_MAX_JUMP_CENTS) {
    tracker.candidate.push(value);
    tracker.candidateCenter = trimmedMean(tracker.candidate) ?? value;
    tracker.consecutive += 1;

    if (tracker.consecutive >= PARTIAL_MIN_CONSECUTIVE_FRAMES) {
      tracker.accepted.push(value);
      const stableCenter = trimmedMean(tracker.candidate);
      tracker.candidate = stableCenter !== null ? [stableCenter] : [value];
      tracker.candidateCenter = stableCenter ?? value;
      tracker.consecutive = PARTIAL_MIN_CONSECUTIVE_FRAMES;
    }
    return;
  }

  tracker.candidate = [value];
  tracker.candidateCenter = value;
  tracker.consecutive = 1;
}

const QuickTuningPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening, debugInfo } = useAudioProcessor();

  const notesCount = state.notesCount ?? 0;
  const noteIndex = state.currentNoteIndex;

  const stableFrequencies = useRef<number[]>([]);
  const justRegistered = useRef(false);
  const collectingNoteName = useRef<string | null>(null);
  const frozenNoteName = useRef<string | null>(null);
  const frozenMidiNote = useRef<number | null>(null);
  const noteCandidateName = useRef<string | null>(null);
  const noteCandidateFrames = useRef(0);
  const lastAudibleAt = useRef(0);
  const octaveTracker = useRef<PartialTracker>({ accepted: [], candidate: [], candidateCenter: null, consecutive: 0 });
  const cFifthTracker = useRef<PartialTracker>({ accepted: [], candidate: [], candidateCenter: null, consecutive: 0 });

  // Tracks full note names already registered this session to prevent duplicates.
  const registeredNoteNames = useRef<Set<string>>(new Set());

  const resetStabilityState = useCallback(() => {
    stableFrequencies.current = [];
    collectingNoteName.current = null;
    frozenNoteName.current = null;
    frozenMidiNote.current = null;
    noteCandidateName.current = null;
    noteCandidateFrames.current = 0;
    lastAudibleAt.current = 0;
    resetPartialTracker(octaveTracker.current);
    resetPartialTracker(cFifthTracker.current);
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
    const activeNoteName = frozenNoteName.current ?? result.noteName;
    if (detectedFreq === null || activeNoteName === null) return;

    const parsedDetectedNote = parseFullNoteName(activeNoteName);
    if (parsedDetectedNote === null) return;

    const noteName = parsedDetectedNote.fullName;
    const midiNote = parsedDetectedNote.midiNote;
    const targetFrequency = midiToFrequency(midiNote);
    const cents = 1200 * Math.log2(detectedFreq / targetFrequency);

    // Prevent the same note from being registered more than once per session.
    if (registeredNoteNames.current.has(noteName)) {
      resetStabilityState();
      return;
    }

    justRegistered.current = true;
    registeredNoteNames.current.add(noteName);

    const OCTAVE_MAX_TARGET_CENTS = 480;
    const CFIFTH_MAX_TARGET_CENTS = 480;

    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);

    const rawOctave = trimmedMean(octaveTracker.current.accepted);
    const rawOctaveCents = rawOctave !== null ? centsBetween(rawOctave, targetOctaveFreq) : null;
    const useMeasuredOctave =
      rawOctave !== null &&
      rawOctaveCents !== null &&
      Math.abs(rawOctaveCents) <= OCTAVE_MAX_TARGET_CENTS;
    const octaveFreq = useMeasuredOctave ? rawOctave : null;
    const octaveCents = octaveFreq !== null ? centsBetween(octaveFreq, targetOctaveFreq) : null;

    const rawCFifth = trimmedMean(cFifthTracker.current.accepted);
    const rawCFifthCents = rawCFifth !== null ? centsBetween(rawCFifth, targetCompoundFifthFreq) : null;
    const useMeasuredCFifth =
      rawCFifth !== null &&
      rawCFifthCents !== null &&
      Math.abs(rawCFifthCents) <= CFIFTH_MAX_TARGET_CENTS;
    const compoundFifthFreq = useMeasuredCFifth ? rawCFifth : null;
    const compoundFifthCents =
      compoundFifthFreq !== null ? centsBetween(compoundFifthFreq, targetCompoundFifthFreq) : null;

    const absCents = Math.abs(cents);
    const status = getTuningStatus(absCents);

    const payload: TuningResult = {
      noteName,
      targetFrequency,
      detectedFrequency: detectedFreq,
      cents,
      status,
      compoundFifthFreq: compoundFifthFreq ?? undefined,
      compoundFifthCents: compoundFifthCents ?? undefined,
      octaveFreq: octaveFreq ?? undefined,
      octaveCents: octaveCents ?? undefined,
    };

    dispatch({ type: 'ADD_TUNING_RESULT', payload });
    dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });

    // Keep collecting late octave / compound fifth frames for this same note during cooldown.
    collectingNoteName.current = noteName;

    setTimeout(() => {
      resetStabilityState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [result.frequency, result.noteName, noteIndex, dispatch, resetStabilityState]);

  // Stability ring shows the audio lock quality (0–100%)
  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const isLockedForRegister = lockQuality >= LOCK_THRESHOLD_REGISTER;
  const shouldRegister = stabilityPct >= 98 || isLockedForRegister;

  // Fast lock flow: freeze a note family once it proves stable enough,
  // then keep collecting only from that family for the rest of the strike.
  useEffect(() => {
    const now = Date.now();

    if (!isListening) {
      resetStabilityState();
      return;
    }

    if (result.frequency === null || result.noteName === null) {
      if (
        frozenNoteName.current !== null &&
        lastAudibleAt.current > 0 &&
        now - lastAudibleAt.current >= NOTE_RELEASE_MS &&
        !justRegistered.current
      ) {
        resetStabilityState();
      }
      return;
    }

    lastAudibleAt.current = now;

    const isAlreadyRegistered = registeredNoteNames.current.has(result.noteName);

    if (justRegistered.current) {
      // During cooldown, keep collecting only for the same note that was just registered.
      if (collectingNoteName.current !== result.noteName) {
        return;
      }
      frozenNoteName.current = collectingNoteName.current;
    } else if (frozenNoteName.current === null) {
      if (noteCandidateName.current === result.noteName) {
        noteCandidateFrames.current += 1;
      } else {
        noteCandidateName.current = result.noteName;
        noteCandidateFrames.current = 1;
      }

      if (
        noteCandidateFrames.current >= MIN_FREEZE_FRAMES &&
        (result.lockQuality ?? 0) >= LOCK_THRESHOLD_DISPLAY
      ) {
        frozenNoteName.current = result.noteName;
        frozenMidiNote.current = parseFullNoteName(result.noteName)?.midiNote ?? null;
        collectingNoteName.current = result.noteName;
      }
    }

    const activeNoteName = frozenNoteName.current ?? collectingNoteName.current ?? result.noteName;
    if (activeNoteName !== result.noteName) {
      return;
    }

    collectingNoteName.current = activeNoteName;

    const lockQ = result.lockQuality ?? 0;

    // Keep the fundamental strict.
    if (lockQ >= 0.55) {
      stableFrequencies.current.push(result.frequency);
    }

    if (result.octaveFrequency !== null) {
      pushPersistentPartialSample(octaveTracker.current, result.octaveFrequency);
    }

    if (result.compoundFifthFrequency !== null) {
      pushPersistentPartialSample(cFifthTracker.current, result.compoundFifthFrequency);
    }

    if (isAlreadyRegistered) {
      const parsedDetectedNote = parseFullNoteName(activeNoteName);
      if (!parsedDetectedNote) return;

      const midiNote = parsedDetectedNote.midiNote;
      const targetOctaveFreq = midiToFrequency(midiNote + 12);
      const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);

      const OCTAVE_MAX_TARGET_CENTS = 480;
      const CFIFTH_MAX_TARGET_CENTS = 480;

      const rawOctave = trimmedMean(octaveTracker.current.accepted);
      const rawOctaveCents = rawOctave !== null ? centsBetween(rawOctave, targetOctaveFreq) : null;
      const useMeasuredOctave =
        rawOctave !== null &&
        rawOctaveCents !== null &&
        Math.abs(rawOctaveCents) <= OCTAVE_MAX_TARGET_CENTS;

      const rawCFifth = trimmedMean(cFifthTracker.current.accepted);
      const rawCFifthCents = rawCFifth !== null ? centsBetween(rawCFifth, targetCompoundFifthFreq) : null;
      const useMeasuredCFifth =
        rawCFifth !== null &&
        rawCFifthCents !== null &&
        Math.abs(rawCFifthCents) <= CFIFTH_MAX_TARGET_CENTS;

      if (useMeasuredOctave || useMeasuredCFifth) {
        dispatch({
          type: 'UPDATE_TUNING_RESULT_PARTIALS',
          payload: {
            noteName: activeNoteName,
            octaveFreq: useMeasuredOctave ? rawOctave ?? undefined : undefined,
            octaveCents: useMeasuredOctave ? rawOctaveCents ?? undefined : undefined,
            compoundFifthFreq: useMeasuredCFifth ? rawCFifth ?? undefined : undefined,
            compoundFifthCents: useMeasuredCFifth ? rawCFifthCents ?? undefined : undefined,
          },
        });
      }

      return;
    }

    if (shouldRegister && !justRegistered.current && frozenNoteName.current !== null) {
      registerNote();
    }
  }, [result, isListening, shouldRegister, registerNote, resetStabilityState, dispatch]);

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

        <div className="note-prompt-card">
          <div className="note-zone-label">Play any note on your handpan</div>
          <div className="note-prompt-name" style={{ color: statusColor }}>
            {result.noteName ?? '—'}
          </div>
          {result.frequency !== null && (
            <div className="note-prompt-freq">{result.frequency.toFixed(2)} Hz</div>
          )}
          <p className="note-instruction">Hold the note ringing — it will be auto-registered</p>
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
