/**
 * StrobeTuningPage – Step 2 of the 2-step tuning workflow.
 *
 * Receives a locked target note from IdentifyNotePage (via React Router state)
 * and displays real-time strobe visualization while measuring fundamental,
 * octave, and compound-fifth deviations with sub-cent accuracy.
 *
 * When all three partials are stable for STABLE_FRAME_THRESHOLD consecutive
 * frames the measurement is saved to AppContext and the page auto-advances
 * to the next note (IdentifyNotePage) or to ResultsPage if all notes are done.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useStrobeTuner, STABLE_FRAME_THRESHOLD } from '../hooks/useStrobeTuner';
import { StrobeDisk } from '../components/StrobeDisk';
import { formatCents, centsToColor } from '../utils/musicUtils';
import {
  getCentsStatus,
  octaveNoteName,
  FUND_DISPLAY_TOLERANCE,
  OCTAVE_DISPLAY_TOLERANCE,
  COMP_FIFTH_DISPLAY_TOLERANCE,
} from '../utils/strobeTuningUtils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DetectedNote {
  name: string;
  frequency: number;
  octaveFrequency?: number;
  compoundFifthFrequency?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

/** Auto-advance delay in ms after measurement locks. */
const ADVANCE_DELAY_MS = 2500;

const StrobeTuningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();

  const detectedNote: DetectedNote | undefined = location.state?.detectedNote;

  const targetFundamental = detectedNote?.frequency ?? 440;
  const targetOctave = detectedNote?.octaveFrequency ?? targetFundamental * 2;
  const targetCompoundFifth = detectedNote?.compoundFifthFrequency ?? targetFundamental * 3;

  const {
    frequency,
    octaveFrequency,
    compoundFifthFrequency,
    cents,
    isStable,
    stabilityFrames,
    isListening,
    error,
  } = useStrobeTuner(targetFundamental, targetOctave, targetCompoundFifth);

  const hasAdvanced = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIndex = state.currentNoteIndex;
  const totalNotes = state.notesCount ?? 0;

  // Redirect to home if no note data was passed via navigation state
  useEffect(() => {
    if (!detectedNote) navigate('/');
  }, [detectedNote, navigate]);

  const handleAdvance = useCallback(() => {
    if (hasAdvanced.current || !detectedNote) return;
    hasAdvanced.current = true;

    const absCents = cents.fundamental !== null ? Math.abs(cents.fundamental) : Infinity;
    const status =
      absCents <= FUND_DISPLAY_TOLERANCE ? 'in-tune' :
      absCents <= FUND_DISPLAY_TOLERANCE * 3.5 ? 'slightly-out-of-tune' :
      'out-of-tune';

    dispatch({
      type: 'ADD_TUNING_RESULT',
      payload: {
        noteName: detectedNote.name,
        targetFrequency: targetFundamental,
        detectedFrequency: frequency,
        cents: cents.fundamental,
        status,
        octaveFreq: octaveFrequency ?? undefined,
        octaveCents: cents.octave ?? undefined,
        compoundFifthFreq: compoundFifthFrequency ?? undefined,
        compoundFifthCents: cents.compoundFifth ?? undefined,
      },
    });

    if (noteIndex + 1 < totalNotes) {
      dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });
      navigate('/identify-note');
    } else {
      navigate('/results');
    }
  }, [
    detectedNote, cents, frequency, octaveFrequency, compoundFifthFrequency,
    targetFundamental, dispatch, navigate, noteIndex, totalNotes,
  ]);

  // Start auto-advance timer when stable; cancel if stability is lost
  useEffect(() => {
    if (isStable && !hasAdvanced.current && advanceTimerRef.current === null) {
      advanceTimerRef.current = setTimeout(handleAdvance, ADVANCE_DELAY_MS);
    } else if (!isStable && advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    return () => {
      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [isStable, handleAdvance]);

  if (!detectedNote) return null;

  // ── Derived display values ─────────────────────────────────────────────────

  const fundStatus = getCentsStatus(cents.fundamental, FUND_DISPLAY_TOLERANCE);
  const octStatus  = getCentsStatus(cents.octave,      OCTAVE_DISPLAY_TOLERANCE);
  const cfStatus   = getCentsStatus(cents.compoundFifth, COMP_FIFTH_DISPLAY_TOLERANCE);

  const fundColor = cents.fundamental !== null ? centsToColor(cents.fundamental) : '#555';
  const octColor  = cents.octave      !== null ? centsToColor(cents.octave)      : '#555';
  const cfColor   = cents.compoundFifth !== null ? centsToColor(cents.compoundFifth) : '#555';

  const stabilityPct = Math.min(
    100,
    Math.round((stabilityFrames / STABLE_FRAME_THRESHOLD) * 100),
  );

  const octName = octaveNoteName(detectedNote.name);

  const handleSkip = () => {
    if (!detectedNote) return;
    dispatch({
      type: 'ADD_TUNING_RESULT',
      payload: {
        noteName: detectedNote.name,
        targetFrequency: targetFundamental,
        detectedFrequency: frequency,
        cents: cents.fundamental,
        status: 'skipped',
      },
    });
    if (noteIndex + 1 < totalNotes) {
      dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });
      navigate('/identify-note');
    } else {
      navigate('/results');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page strobe-tuning-page">

      {/* ── Header ── */}
      <div className="page-header">
        <h2 className="strobe-note-title">Now play {detectedNote.name} steadily…</h2>
        <p className="strobe-instruction">Hold the note ringing while the strobe locks in</p>
        <p className="strobe-target-freq">Target: {targetFundamental.toFixed(2)} Hz</p>
      </div>

      {/* ── Main strobe disk ── */}
      <div className="strobe-main">
        <StrobeDisk
          detectedFreq={frequency}
          referenceFreq={targetFundamental}
          label={detectedNote.name}
          active={isListening && frequency !== null}
          size={220}
        />
        {cents.fundamental !== null && (
          <div className="strobe-cents-overlay" style={{ color: fundColor }}>
            {formatCents(cents.fundamental)}
          </div>
        )}
        {!isListening && cents.fundamental === null && (
          <div className="strobe-listening-hint">
            Listening for {detectedNote.name}…
          </div>
        )}
      </div>

      {/* ── Partials grid ── */}
      <div className="partials-grid">

        <div className={`partial-box ${fundStatus.className}`}>
          <div className="partial-name">Fundamental ({detectedNote.name})</div>
          <div className="partial-target-freq">{targetFundamental.toFixed(2)} Hz</div>
          <div className="partial-detected-freq">
            {frequency !== null
              ? `${frequency.toFixed(2)} Hz`
              : isListening ? 'Listening…' : '—'}
          </div>
          <div className="partial-cents" style={{ color: fundColor }}>
            {cents.fundamental !== null ? formatCents(cents.fundamental) : '—'}{' '}
            <span className="partial-icon">{fundStatus.icon}</span>
          </div>
        </div>

        <div className={`partial-box ${octStatus.className}`}>
          <div className="partial-name">Octave ({octName})</div>
          <div className="partial-target-freq">{targetOctave.toFixed(2)} Hz</div>
          <div className="partial-detected-freq">
            {octaveFrequency !== null
              ? `${octaveFrequency.toFixed(2)} Hz`
              : isListening ? 'Listening…' : '—'}
          </div>
          <div className="partial-cents" style={{ color: octColor }}>
            {cents.octave !== null ? formatCents(cents.octave) : '—'}{' '}
            <span className="partial-icon">{octStatus.icon}</span>
          </div>
        </div>

        <div className={`partial-box ${cfStatus.className}`}>
          <div className="partial-name">C5th ({detectedNote.name})</div>
          <div className="partial-target-freq">{targetCompoundFifth.toFixed(2)} Hz</div>
          <div className="partial-detected-freq">
            {compoundFifthFrequency !== null
              ? `${compoundFifthFrequency.toFixed(2)} Hz`
              : isListening ? 'Listening…' : '—'}
          </div>
          <div className="partial-cents" style={{ color: cfColor }}>
            {cents.compoundFifth !== null ? formatCents(cents.compoundFifth) : '—'}{' '}
            <span className="partial-icon">{cfStatus.icon}</span>
          </div>
        </div>

      </div>

      {/* ── Stability status ── */}
      <div className="strobe-stability-status">
        {isStable ? (
          <>
            <div className="stability-locked">✓ Measurement locked!</div>
            <div className="stability-countdown">Next note in 2.5 seconds…</div>
          </>
        ) : (
          <div className="stability-progress">
            {isListening
              ? `Holding steady… ${stabilityFrames}/${STABLE_FRAME_THRESHOLD} frames (${stabilityPct}%)`
              : `Listening for ${detectedNote.name}…`}
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner">
          {error.toLowerCase().includes('denied') || error.toLowerCase().includes('permission')
            ? 'Microphone error – please check permissions'
            : error}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="page-actions">
        <button
          className="btn btn-secondary"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <button
          className="btn btn-ghost"
          onClick={handleSkip}
        >
          Skip
        </button>
      </div>

    </div>
  );
};

export default StrobeTuningPage;
