import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessorForScaleIdentification } from '../hooks/useAudioProcessorForScaleIdentification';
import { identifyScales, noteToPitchClass } from '../utils/scaleIdentifier';
import type { ScaleMatch } from '../utils/scaleIdentifier';

/** Minimum ms a note must be continuously detected before it is registered */
const NOTE_HOLD_MS = 350;

interface IdentifierState {
  /** Pitch class numbers detected so far (unique) */
  detectedPcs: number[];
  /** Display names for detected notes, in detection order (unique) */
  detectedNoteNames: string[];
  /** Scale matches computed from the detected set */
  matches: ScaleMatch[];
}

type IdentifierAction =
  | { type: 'ADD_NOTE'; noteFullName: string; pcNum: number }
  | { type: 'RESET' };

const initialState: IdentifierState = {
  detectedPcs: [],
  detectedNoteNames: [],
  matches: [],
};

function identifierReducer(state: IdentifierState, action: IdentifierAction): IdentifierState {
  switch (action.type) {
    case 'ADD_NOTE': {
      if (state.detectedPcs.includes(action.pcNum)) return state;
      const nextPcs = [...state.detectedPcs, action.pcNum];
      return {
        detectedPcs: nextPcs,
        detectedNoteNames: [...state.detectedNoteNames, action.noteFullName],
        matches: identifyScales(nextPcs),
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

  // Stable-note tracking: we only register a note after it has been
  // continuously detected for NOTE_HOLD_MS to avoid transient spikes.
  const lastNoteRef = useRef<string | null>(null);
  const noteStartRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    stopListening();
    dispatch({ type: 'RESET' });
    lastNoteRef.current = null;
    noteStartRef.current = null;
  }, [stopListening]);

  // Register a pitch class when the hook reports a new note.
  // Depends on `result` (a new object every audio frame) so the elapsed-time
  // check runs every frame — not just when the pitch class string changes.
  useEffect(() => {
    const { pitchClass, noteFullName } = result;

    if (!pitchClass || !noteFullName) {
      lastNoteRef.current = null;
      noteStartRef.current = null;
      return;
    }

    if (pitchClass !== lastNoteRef.current) {
      lastNoteRef.current = pitchClass;
      noteStartRef.current = Date.now();
      return;
    }

    const elapsed = Date.now() - (noteStartRef.current ?? Date.now());
    if (elapsed < NOTE_HOLD_MS) return;

    const pcNum = noteToPitchClass(pitchClass);
    if (pcNum === null) return;

    // Prevent re-firing for the same hold event
    noteStartRef.current = Date.now() + NOTE_HOLD_MS * 100;

    dispatch({ type: 'ADD_NOTE', noteFullName, pcNum });
  }, [result]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const { detectedNoteNames, matches } = state;

  return (
    <div className="page scale-identifier-page">
      <div className="page-header">
        <h2 className="page-title">🔍 Identify Your Scale</h2>
        <p className="page-subtitle">
          Play each note of your handpan — we will identify the scale for you
        </p>
      </div>

      <div className="page-content">
        {/* Instructions */}
        <div className="identifier-instructions">
          <p>Strike every tone field and the ding, one at a time.</p>
          <p>Let each note ring clearly before striking the next one.</p>
        </div>

        {/* Microphone control */}
        <div className="mic-controls">
          <button
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
            onClick={isListening ? stopListening : startListening}
          >
            {isListening ? '⏹ Stop Microphone' : '🎤 Start Microphone'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Live detection indicator */}
        {isListening && (
          <div className="identifier-live">
            {result.noteFullName ? (
              <span className="identifier-note-flash">{result.noteFullName}</span>
            ) : (
              <span className="listening-anim">🎵 Listening…</span>
            )}
          </div>
        )}

        {/* Detected notes */}
        {detectedNoteNames.length > 0 && (
          <div className="identifier-detected-notes">
            <p className="identifier-section-label">Notes Detected ({detectedNoteNames.length})</p>
            <div className="identifier-note-chips">
              {detectedNoteNames.map(name => (
                <span key={name} className="identifier-chip">{name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Scale matches */}
        {matches.length > 0 && (
          <div className="identifier-results">
            <p className="identifier-section-label">Matching Scales</p>
            <div className="identifier-matches">
              {matches.slice(0, 5).map(m => (
                <div
                  key={m.scale.theoreticalName}
                  className={`identifier-match-card ${m.isExactMatch ? 'exact-match' : ''}`}
                >
                  <div className="match-handpan-name">{m.scale.handpanName}</div>
                  <div className="match-theoretical-name">{m.scale.theoreticalName}</div>
                  <div className="match-notes">
                    {m.scale.notes.filter((n, i, a) => a.indexOf(n) === i).join(' · ')}
                  </div>
                  {m.isExactMatch && (
                    <span className="match-exact-badge">✓ Exact match</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hint when no match found yet */}
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
