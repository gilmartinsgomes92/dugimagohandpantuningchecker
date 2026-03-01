import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessorForScaleIdentification } from '../hooks/useAudioProcessorForScaleIdentification';
import { identifyScales, noteToPitchClass } from '../utils/scaleIdentifier';
import type { ScaleMatch } from '../utils/scaleIdentifier';

/**
 * Minimum ms a note must be continuously detected before it is registered.
 * Reduced from 350 ms to 250 ms for snappier registration without increasing
 * false positives (the STABILITY_FRAMES filter handles that).
 */
const NOTE_HOLD_MS = 250;

interface IdentifierState {
  /** Pitch class numbers detected so far (unique, for scale matching) */
  detectedPcs: number[];
  /** Full note names already registered, to avoid duplicate chips (e.g. "D4") */
  detectedNoteFullNames: Set<string>;
  /** Display chips in detection order — one per unique octave+note */
  detectedNoteNames: string[];
  /** Scale matches computed from the detected set */
  matches: ScaleMatch[];
  /**
   * Pitch class of the first registered note — treated as the "ding" (root).
   * Used to highlight scale matches whose root matches the ding.
   */
  dingPitchClass: number | null;
}

type IdentifierAction =
  | { type: 'ADD_NOTE'; noteFullName: string; pcNum: number }
  | { type: 'RESET' };

const initialState: IdentifierState = {
  detectedPcs: [],
  detectedNoteFullNames: new Set(),
  detectedNoteNames: [],
  matches: [],
  dingPitchClass: null,
};

function identifierReducer(state: IdentifierState, action: IdentifierAction): IdentifierState {
  switch (action.type) {
    case 'ADD_NOTE': {
      if (state.detectedNoteFullNames.has(action.noteFullName)) return state;

      const isFirstNote = state.detectedPcs.length === 0;
      const dingPitchClass = isFirstNote ? action.pcNum : state.dingPitchClass;

      const pcAlreadyKnown = state.detectedPcs.includes(action.pcNum);
      const nextPcs = pcAlreadyKnown ? state.detectedPcs : [...state.detectedPcs, action.pcNum];
      const nextFullNames = new Set(state.detectedNoteFullNames).add(action.noteFullName);
      return {
        detectedPcs: nextPcs,
        detectedNoteFullNames: nextFullNames,
        detectedNoteNames: [...state.detectedNoteNames, action.noteFullName],
        matches: pcAlreadyKnown
          ? state.matches
          : identifyScales(nextPcs, dingPitchClass ?? undefined),
        dingPitchClass,
      };
    }
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const ScaleIdentifierPage: React.FC = () => {
  const navigate = useNavigate();
  const { isListening, result, error, startListening, stopListening } = useAudioProcessorForScaleIdentification();
  const [state, dispatch] = useReducer(identifierReducer, initialState);

  const lastNoteRef = useRef<string | null>(null);
  const noteStartRef = useRef<number | null>(null);
  const candidateFullNameRef = useRef<string | null>(null);
  /**
   * Pitch class of the most recently registered note (e.g. "D").
   * Suppresses re-registration of the same note from its own decaying ring,
   * and also blocks wrong-octave aliases (F5 after F4) since they share "F".
   * Lifted when a genuinely different non-null pitch class appears.
   */
  const suppressedClassRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    stopListening();
    dispatch({ type: 'RESET' });
    lastNoteRef.current = null;
    noteStartRef.current = null;
    candidateFullNameRef.current = null;
    suppressedClassRef.current = null;
  }, [stopListening]);

  const clearDetectionRefs = useCallback(() => {
    lastNoteRef.current = null;
    noteStartRef.current = null;
    candidateFullNameRef.current = null;
    suppressedClassRef.current = null;
  }, []);

  const handleStartListening = useCallback(() => {
    clearDetectionRefs();
    startListening();
  }, [clearDetectionRefs, startListening]);

  useEffect(() => {
    const { pitchClass, noteFullName } = result;
    const now = Date.now();

    if (suppressedClassRef.current !== null) {
      if (!pitchClass) return;
      if (pitchClass === suppressedClassRef.current) return;
      suppressedClassRef.current = null;
    }

    if (!pitchClass || !noteFullName) return;

    if (pitchClass !== lastNoteRef.current) {
      lastNoteRef.current = pitchClass;
      noteStartRef.current = now;
      candidateFullNameRef.current = noteFullName;
      return;
    }

    const elapsed = now - (noteStartRef.current ?? now);
    if (elapsed < NOTE_HOLD_MS) return;

    const pcNum = noteToPitchClass(pitchClass);
    if (pcNum === null) return;

    const registeredName = candidateFullNameRef.current ?? noteFullName;

    suppressedClassRef.current = pitchClass;
    lastNoteRef.current = null;
    noteStartRef.current = null;
    candidateFullNameRef.current = null;

    dispatch({ type: 'ADD_NOTE', noteFullName: registeredName, pcNum });
  }, [result]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const { detectedNoteNames, matches, dingPitchClass } = state;

  // Partition matches: ding-matched at top, others below
  const dingMatches = matches.filter(m => m.isDingMatch);
  const otherMatches = matches.filter(m => !m.isDingMatch);

  const renderCard = (m: ScaleMatch) => (
    <div
      key={m.scale.theoreticalName}
      className={[
        'identifier-match-card',
        m.isExactMatch ? 'exact-match' : '',
        m.isDingMatch ? 'ding-match' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="match-handpan-name">{m.scale.handpanName}</div>
      <div className="match-theoretical-name">{m.scale.theoreticalName}</div>
      <div className="match-notes">
        {m.scale.notes.filter((n, i, a) => a.indexOf(n) === i).join(' · ')}
      </div>
      <div className="match-badges">
        {m.isDingMatch && (
          <span className="match-ding-badge">⭐ Best for your Ding</span>
        )}
        {m.isExactMatch && (
          <span className="match-exact-badge">✓ Exact match</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="page scale-identifier-page">
      <div className="page-header">
        <h2 className="page-title">🔍 Identify Your Scale</h2>
        <p className="page-subtitle">
          Play each note of your handpan — we will identify the scale for you
        </p>
      </div>

      <div className="page-content">
        <div className="identifier-instructions">
          <p>Start with the <strong>Ding</strong> (lowest / centre note), then strike each tone field.</p>
          <p>Let each note ring clearly before striking the next one.</p>
        </div>

        <div className="mic-controls">
          <button
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
            onClick={isListening ? stopListening : handleStartListening}
          >
            {isListening ? '⏹ Stop Microphone' : '🎤 Start Microphone'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {isListening && (
          <div className="identifier-live">
            {result.noteFullName ? (
              <span className="identifier-note-flash">{result.noteFullName}</span>
            ) : (
              <span className="listening-anim">🎵 Listening…</span>
            )}
          </div>
        )}

        {detectedNoteNames.length > 0 && (
          <div className="identifier-detected-notes">
            <p className="identifier-section-label">
              Notes Detected ({detectedNoteNames.length})
              {dingPitchClass !== null && (
                <span className="identifier-ding-hint"> · Ding: {detectedNoteNames[0]}</span>
              )}
            </p>
            <div className="identifier-note-chips">
              {detectedNoteNames.map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className={`identifier-chip${i === 0 ? ' ding-chip' : ''}`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {matches.length > 0 && (
          <div className="identifier-results">
            {dingMatches.length > 0 && (
              <>
                <p className="identifier-section-label">Best Matches (Ding = {detectedNoteNames[0]})</p>
                <div className="identifier-matches">
                  {dingMatches.slice(0, 5).map(renderCard)}
                </div>
              </>
            )}
            {otherMatches.length > 0 && (
              <>
                <p className="identifier-section-label" style={{ marginTop: dingMatches.length > 0 ? '16px' : '0' }}>
                  {dingMatches.length > 0 ? 'Other Matching Scales' : 'Matching Scales'}
                </p>
                <div className="identifier-matches">
                  {otherMatches.slice(0, 5).map(renderCard)}
                </div>
              </>
            )}
          </div>
        )}

        {state.detectedPcs.length > 0 && matches.length === 0 && (
          <div className="identifier-no-match">
            <p>No matching scale found yet — keep playing more notes!</p>
          </div>
        )}
      </div>

      <div className="page-actions">
        <button className="btn btn-secondary" onClick={() => { reset(); navigate('/scale-selection'); }}>
          ← Back
        </button>
        <button className="btn btn-ghost" onClick={reset}>
          🔄 Reset
        </button>
      </div>
    </div>
  );
};

export default ScaleIdentifierPage;
