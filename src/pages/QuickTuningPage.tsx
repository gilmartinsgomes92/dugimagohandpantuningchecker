import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor, frequencyToNote } from '../utils/musicUtils';
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

function getTuningStatus(absCents: number): TuningResult['status'] {
  if (absCents <= 7) return 'in-tune';
  if (absCents <= 15) return 'slightly-out-of-tune';
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

  // Auto-start listening when the page loads
  useEffect(() => {
    if (!isListening) startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to results when all notes are registered
  useEffect(() => {
    if (notesCount > 0 && registeredCount >= notesCount) {
      stopListening();
      navigate('/results');
    }
  }, [registeredCount, notesCount, stopListening, navigate]);

  const registerNote = useCallback(() => {
    if (justRegistered.current) return;

    const trimmedMean = (freqs: number[]): number | null => {
      if (freqs.length === 0) return null;
      const sorted = [...freqs].sort((a, b) => a - b);
      const trimCount = Math.floor(sorted.length * 0.25);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      return trimmed.length > 0
        ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
        : sorted[Math.floor((sorted.length - 1) / 2)];
    };

    const detectedFreq = trimmedMean(stableFrequencies.current) ?? result.frequency;
    if (detectedFreq === null) return;

    const noteData = frequencyToNote(detectedFreq);
    const cents = noteData.cents;
    const noteName = noteData.fullName;

    // Prevent the same note from being registered more than once per session.
    if (registeredNoteNames.current.has(noteName)) {
      resetStabilityState();
      return;
    }

    justRegistered.current = true;
    registeredNoteNames.current.add(noteName);

    const midiFloat = 12 * Math.log2(detectedFreq / 440) + 69;
    const midiNote = Math.round(midiFloat);

    // Independently measure octave and compound fifth partials (trimmed mean)
    const MAX_PARTIAL_CENTS = 40;

    const rawOctave = trimmedMean(stableOctaveFreqs.current);
    const octaveFreq =
      rawOctave !== null &&
      Math.abs(1200 * Math.log2(rawOctave / (detectedFreq * 2))) <= MAX_PARTIAL_CENTS
        ? rawOctave
        : detectedFreq * 2;
    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const octaveCents = 1200 * Math.log2(octaveFreq / targetOctaveFreq);

    const rawCFifth = trimmedMean(stableCFifthFreqs.current);
    const compoundFifthFreq =
      rawCFifth !== null &&
      Math.abs(1200 * Math.log2(rawCFifth / (detectedFreq * 3))) <= MAX_PARTIAL_CENTS
        ? rawCFifth
        : detectedFreq * 3;
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);
    const compoundFifthCents = 1200 * Math.log2(compoundFifthFreq / targetCompoundFifthFreq);

    const absCents = Math.abs(cents);
    const status = getTuningStatus(absCents);

    const payload: TuningResult = {
      noteName,
      targetFrequency: midiToFrequency(midiNote),
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

    resetStabilityState();

    setTimeout(() => {
      resetStabilityState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [result, noteIndex, dispatch, resetStabilityState]);

  // Fast lock flow: use lockQuality from the audio hook.
  // Collect immediately when lock is decent; register when lock is strong.
  useEffect(() => {
    if (!isListening || justRegistered.current) {
      resetStabilityState();
      return;
    }

    if (result.frequency === null || result.noteName === null) return;

    // Skip frames for notes already registered (prevents ring-out from blocking new notes)
    if (registeredNoteNames.current.has(result.noteName)) return;

    const lockQ = result.lockQuality ?? 0;

    if (lockQ >= 0.55) {
      stableFrequencies.current.push(result.frequency);
      if (result.octaveFrequency !== null) stableOctaveFreqs.current.push(result.octaveFrequency);
      if (result.compoundFifthFrequency !== null)
        stableCFifthFreqs.current.push(result.compoundFifthFrequency);
    }

    if (
      shouldRegister &&      !justRegistered.current
    ) {
      registerNote();
    }
  }, [result, isListening, registerNote, resetStabilityState]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;

  // Stability ring shows the audio lock quality (0–100%)
  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const isLockedForRegister = lockQuality >= LOCK_THRESHOLD_REGISTER;
  const shouldRegister = stabilityPct >= 98 || isLockedForRegister;

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
