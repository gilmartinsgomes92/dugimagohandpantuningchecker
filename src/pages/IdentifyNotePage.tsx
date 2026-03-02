/**
 * IdentifyNotePage – Step 1 of the 2-step tuning workflow.
 *
 * Listens for any note played on the handpan, detects the fundamental
 * frequency using the existing YIN algorithm via useAudioProcessor(),
 * and asks the user to confirm before advancing to StrobeTuningPage.
 *
 * Once confirmed the detected note is:
 *  1. Stored in AppContext via SET_DETECTED_NOTE
 *  2. Passed to /strobe-tuning via React Router navigation state
 */

import React, { useReducer, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import {
  getUserFriendlyError,
  isStableDetection,
  IDENTIFY_LISTEN_TIMEOUT_MS,
} from '../utils/identifyNoteUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedResult {
  name: string;
  frequency: number;
  octaveFrequency: number | null;
  compoundFifthFrequency: number | null;
}

type PageState =
  | { phase: 'idle' }
  | { phase: 'listening' }
  | { phase: 'detected'; result: DetectedResult }
  | { phase: 'error'; message: string };

type PageAction =
  | { type: 'START_LISTENING' }
  | { type: 'NOTE_DETECTED'; result: DetectedResult }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'RESET' };

function pageReducer(_state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'START_LISTENING': return { phase: 'listening' };
    case 'NOTE_DETECTED':   return { phase: 'detected', result: action.result };
    case 'SET_ERROR':       return { phase: 'error', message: action.message };
    case 'RESET':           return { phase: 'idle' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const IdentifyNotePage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch: appDispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening } = useAudioProcessor();

  const [pageState, pageDispatch] = useReducer(pageReducer, { phase: 'idle' });

  // Stability detection refs (mirrors QuickTuningPage approach)
  const stableFrames = useRef(0);
  const lastPitchClass = useRef<string | null>(null);
  const hasDetected = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop audio and clear timeout on unmount
  useEffect(() => () => {
    stopListening();
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, [stopListening]);

  const resetDetectionState = useCallback(() => {
    stableFrames.current = 0;
    lastPitchClass.current = null;
    hasDetected.current = false;
  }, []);

  const handleStartListening = useCallback(() => {
    resetDetectionState();
    pageDispatch({ type: 'START_LISTENING' });
    startListening();

    // Timeout: no audio after IDENTIFY_LISTEN_TIMEOUT_MS → show error
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!hasDetected.current) {
        stopListening();
        pageDispatch({ type: 'SET_ERROR', message: 'No sound detected. Please try again and play louder.' });
      }
    }, IDENTIFY_LISTEN_TIMEOUT_MS);
  }, [startListening, stopListening, resetDetectionState]);

  const handleTryAgain = useCallback(() => {
    resetDetectionState();
    pageDispatch({ type: 'RESET' });
  }, [resetDetectionState]);

  const handleConfirm = useCallback(() => {
    if (pageState.phase !== 'detected') return;
    const { result: detectedResult } = pageState;
    appDispatch({
      type: 'SET_DETECTED_NOTE',
      payload: {
        name: detectedResult.name,
        frequency: detectedResult.frequency,
        octaveFrequency: detectedResult.octaveFrequency ?? undefined,
        compoundFifthFrequency: detectedResult.compoundFifthFrequency ?? undefined,
      },
    });
    navigate('/strobe-tuning', { state: { detectedNote: detectedResult } });
  }, [pageState, appDispatch, navigate]);

  // Propagate hook errors to the error phase
  useEffect(() => {
    if (error && pageState.phase === 'listening') {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      stopListening();
      pageDispatch({ type: 'SET_ERROR', message: getUserFriendlyError(error) });
    }
  }, [error, pageState.phase, stopListening]);

  // Stability detection: accept the note once IDENTIFY_STABLE_FRAMES_REQUIRED
  // consecutive frames share the same pitch class.
  useEffect(() => {
    if (!isListening || result.frequency === null || result.noteName === null || pageState.phase !== 'listening') {
      return;
    }

    // Strip trailing octave digit(s) to get pitch class, e.g. "A3" → "A", "D#4" → "D#"
    const pitchClass = result.noteName.replace(/\d+$/, '');
    const anchor = lastPitchClass.current;

    if (anchor !== null && pitchClass === anchor) {
      stableFrames.current += 1;

      if (isStableDetection(stableFrames.current) && !hasDetected.current) {
        hasDetected.current = true;
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        stopListening();
        pageDispatch({
          type: 'NOTE_DETECTED',
          result: {
            name: result.noteName,
            frequency: result.frequency,
            octaveFrequency: result.octaveFrequency,
            compoundFifthFrequency: result.compoundFifthFrequency,
          },
        });
      }
    } else {
      lastPitchClass.current = pitchClass;
      stableFrames.current = 1;
    }
  }, [result, isListening, pageState.phase, stopListening]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page identify-note-page">

      {/* ── Header ── */}
      <div className="page-header">
        <h1 className="identify-title">Identify Your Note</h1>
        <p className="identify-subtitle">Step 1 of 2 — Let's find out which note you're playing</p>
      </div>

      {/* ── Idle state ── */}
      {pageState.phase === 'idle' && (
        <div className="identify-idle">
          <div className="identify-icon">🎵</div>
          <p className="identify-instruction">
            Tap the button below and play any note on your handpan
          </p>
          <button
            className="btn btn-primary btn-large identify-start-btn"
            onClick={handleStartListening}
          >
            Start Listening
          </button>
        </div>
      )}

      {/* ── Listening state ── */}
      {pageState.phase === 'listening' && (
        <div className="identify-listening">
          <div className="identify-spinner" aria-label="Listening…" role="status">🎙️</div>
          <p className="identify-listening-text">Listening… Play a note now</p>
          <p className="identify-listening-hint">Hold the note for about 1 second</p>
        </div>
      )}

      {/* ── Detected state ── */}
      {pageState.phase === 'detected' && (
        <div className="identify-detected">
          <div className="identify-detected-card">
            <p className="identify-detected-label">Detected Note</p>
            <div className="identify-detected-note">{pageState.result.name}</div>
            <div className="identify-detected-freq">
              {pageState.result.frequency.toFixed(2)} Hz
            </div>
          </div>
          <p className="identify-detected-question">Is this the note you played?</p>
          <div className="identify-detected-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={handleConfirm}
            >
              Correct ✓
            </button>
            <button
              className="btn btn-secondary btn-large"
              onClick={handleTryAgain}
            >
              Try Again →
            </button>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {pageState.phase === 'error' && (
        <div className="identify-error">
          <div className="identify-error-icon" aria-hidden="true">⚠️</div>
          <p className="identify-error-message">{pageState.message}</p>
          <button
            className="btn btn-primary btn-large"
            onClick={handleStartListening}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Footer actions ── */}
      <div className="page-actions">
        <button
          className="btn btn-secondary"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>

    </div>
  );
};

export default IdentifyNotePage;
