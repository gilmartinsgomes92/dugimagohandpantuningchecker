import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessorForScaleIdentification } from '../hooks/useAudioProcessorForScaleIdentification';
import { identifyScales, noteToPitchClass } from '../utils/scaleIdentifier';
import type { ScaleMatch } from '../utils/scaleIdentifier';

/** Minimum ms a note must be continuously detected before it is registered */
const NOTE_HOLD_MS = 350;
/**
 * After a note registers, ignore low-amplitude audio for this long.
 * Handpans can ring for several seconds; 1500 ms covers the loudest harmonic
 * content while still feeling responsive. The cooldown is cancelled early
 * whenever a new note strike is detected (see NEW_STRIKE_RMS below).
 */
const POST_REGISTER_COOLDOWN_MS = 1500;
/**
 * RMS level above which an incoming audio frame is treated as a fresh note
 * strike (not residual resonance). Cancels the post-registration cooldown
 * immediately so the next note can be detected right away.
 * Typical new strike: 0.05–0.3 · Typical 1 s old resonance: 0.003–0.015
 */
const NEW_STRIKE_RMS = 0.025;

interface IdentifierState {
  /** Pitch class numbers detected so far (unique, for scale matching) */
  detectedPcs: number[];
  /** Full note names already registered, to avoid duplicate chips (e.g. "D4") */
  detectedNoteFullNames: Set<string>;
  /** Display chips in detection order — one per unique octave+note */
  detectedNoteNames: string[];
  /** Scale matches computed from the detected set */
  matches: ScaleMatch[];
}

type IdentifierAction =
  | { type: 'ADD_NOTE'; noteFullName: string; pcNum: number }
  | { type: 'RESET' };

const initialState: IdentifierState = {
  detectedPcs: [],
  detectedNoteFullNames: new Set(),
  detectedNoteNames: [],
  matches: [],
};

function identifierReducer(state: IdentifierState, action: IdentifierAction): IdentifierState {
  switch (action.type) {
    case 'ADD_NOTE': {
      // Ignore if the exact same full note name (e.g. "D4") was already registered
      if (state.detectedNoteFullNames.has(action.noteFullName)) return state;
      // A new octave of an already-known pitch class contributes a chip but
      // doesn't change the pitch-class set used for scale matching.
      const pcAlreadyKnown = state.detectedPcs.includes(action.pcNum);
      const nextPcs = pcAlreadyKnown ? state.detectedPcs : [...state.detectedPcs, action.pcNum];
      const nextFullNames = new Set(state.detectedNoteFullNames).add(action.noteFullName);
      return {
        detectedPcs: nextPcs,
        detectedNoteFullNames: nextFullNames,
        detectedNoteNames: [...state.detectedNoteNames, action.noteFullName],
        matches: pcAlreadyKnown ? state.matches : identifyScales(nextPcs),
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
  /** Full note name (with octave) captured when the current candidate was first seen. */
  const candidateFullNameRef = useRef<string | null>(null);
  /**
   * Timestamp until which post-registration audio is suppressed.
   * Cancelled early by a new-strike amplitude spike (rms ≥ NEW_STRIKE_RMS).
   */
  const cooldownUntilRef = useRef<number>(0);

  const reset = useCallback(() => {
    stopListening();
    dispatch({ type: 'RESET' });
    lastNoteRef.current = null;
    noteStartRef.current = null;
    candidateFullNameRef.current = null;
    cooldownUntilRef.current = 0;
  }, [stopListening]);

  // Register a pitch class when the hook reports a new note.
  // Depends on `result` (a new object every audio frame) so the elapsed-time
  // check runs every frame — not just when the pitch class string changes.
  useEffect(() => {
    const { pitchClass, noteFullName, rms } = result;
    const now = Date.now();

    // Post-registration cooldown suppresses the decaying resonance of the
    // last-struck note.  A new-strike amplitude spike (the player hits the
    // next tone field) cancels it immediately so there is no mandatory wait.
    if (now < cooldownUntilRef.current) {
      if (rms >= NEW_STRIKE_RMS) {
        cooldownUntilRef.current = 0;
        lastNoteRef.current = null;
        noteStartRef.current = null;
        candidateFullNameRef.current = null;
      } else {
        return;
      }
    }

    if (!pitchClass || !noteFullName) {
      // Silence: pause the timer but keep the candidate note.
      // Brief silent frames in the decaying resonance must not restart the
      // 350 ms window for the NEXT note the player is sustaining.
      return;
    }

    if (pitchClass !== lastNoteRef.current) {
      // New pitch detected — start a fresh candidate window.
      lastNoteRef.current = pitchClass;
      noteStartRef.current = now;
      candidateFullNameRef.current = noteFullName;
      return;
    }

    // Same pitch continuing — check hold time.
    const elapsed = now - (noteStartRef.current ?? now);
    if (elapsed < NOTE_HOLD_MS) return;

    const pcNum = noteToPitchClass(pitchClass);
    if (pcNum === null) return;

    const registeredName = candidateFullNameRef.current ?? noteFullName;

    // Start cooldown and clear tracking so the next note begins completely fresh.
    cooldownUntilRef.current = now + POST_REGISTER_COOLDOWN_MS;
    lastNoteRef.current = null;
    noteStartRef.current = null;
    candidateFullNameRef.current = null;

    dispatch({ type: 'ADD_NOTE', noteFullName: registeredName, pcNum });
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
