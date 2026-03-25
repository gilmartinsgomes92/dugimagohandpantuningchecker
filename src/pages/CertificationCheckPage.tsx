import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { useCertificationAggregates, useCertificationContext } from '../contexts/CertificationContext';
import { CentsGauge } from '../components/CentsGauge';
import { centsToColor, formatCents, midiToFrequency } from '../utils/musicUtils';
import type { CertificationStrike } from '../types/certification';

const REGISTRATION_COOLDOWN_MS = 1300;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const LOCK_THRESHOLD_REGISTER = IS_IOS ? 0.62 : 0.68;
const LOCK_THRESHOLD_DISPLAY = IS_IOS ? 0.55 : 0.60;
const PARTIAL_MIN_SAMPLES = 4;
const PARTIAL_EXTRA_HOLD_MS = 1100;
const PARTIAL_MAX_WAIT_MS = 2200;
const SAME_NOTE_GRACE_MS = 240;

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

function hasEnoughPartialEvidence(octaveFrames: number[], cFifthFrames: number[]): boolean {
  return octaveFrames.length >= PARTIAL_MIN_SAMPLES || cFifthFrames.length >= PARTIAL_MIN_SAMPLES;
}

const CertificationCheckPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useCertificationContext();
  const aggregates = useCertificationAggregates();
  const { isListening, result, error, startListening, stopListening } = useAudioProcessor();

  const notesCount = state.notesCount ?? 0;
  const noteIndex = state.currentNoteIndex;
  const currentStrikes = state.strikesByNote[noteIndex] ?? [];
  const strikeNumber = Math.min(3, currentStrikes.length + 1);
  const currentAggregate = aggregates[noteIndex];
  const lockedNoteName = state.lockedNoteNames[noteIndex] ?? null;
  const currentExpectations = state.expectationsByNote[noteIndex] ?? { octave: true, compoundFifth: true };
  const noteComplete = currentStrikes.length >= 3;
  const allDone = notesCount > 0 && state.strikesByNote.every((noteStrikes) => noteStrikes.length >= 3);

  const stableFrequencies = useRef<number[]>([]);
  const stableOctaveFreqs = useRef<number[]>([]);
  const stableCFifthFreqs = useRef<number[]>([]);
  const collectingNoteName = useRef<string | null>(null);
  const noteCaptureStartedAt = useRef<number>(0);
  const sameNoteSince = useRef<number>(0);
  const noteWaitingForPartials = useRef<string | null>(null);
  const justRegistered = useRef(false);

  const [instructionText, setInstructionText] = useState('Strike the same note 3 times for a certification-grade result');

  const resetCaptureState = useCallback(() => {
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
    collectingNoteName.current = null;
    noteCaptureStartedAt.current = 0;
    sameNoteSince.current = 0;
    noteWaitingForPartials.current = null;
    setInstructionText('Strike the same note 3 times for a certification-grade result');
  }, []);

  useEffect(() => {
    if (!state.notesCount) navigate('/certification/start');
  }, [state.notesCount, navigate]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  useEffect(() => {
    if (!isListening) {
      void startListening();
    }
  }, [isListening, startListening]);

  useEffect(() => {
    resetCaptureState();
  }, [noteIndex, resetCaptureState]);

  const registerStrike = useCallback(() => {
    if (justRegistered.current || noteComplete) return;

    const detectedFreq = trimmedMean(stableFrequencies.current) ?? result.frequency;
    const detectedNoteName = result.noteName;
    if (detectedFreq === null || detectedNoteName === null) return;

    const parsed = parseFullNoteName(detectedNoteName);
    if (!parsed) return;

    const targetFrequency = midiToFrequency(parsed.midiNote);
    const targetOctaveFreq = midiToFrequency(parsed.midiNote + 12);
    const targetCompoundFifthFreq = midiToFrequency(parsed.midiNote + 19);

    const rawOctave = trimmedMean(stableOctaveFreqs.current);
    const octaveCents = rawOctave !== null ? 1200 * Math.log2(rawOctave / targetOctaveFreq) : null;

    const rawCFifth = trimmedMean(stableCFifthFreqs.current);
    const compoundFifthCents = rawCFifth !== null ? 1200 * Math.log2(rawCFifth / targetCompoundFifthFreq) : null;

    const strike: CertificationStrike = {
      noteName: parsed.fullName,
      targetFrequency,
      detectedFrequency: detectedFreq,
      cents: 1200 * Math.log2(detectedFreq / targetFrequency),
      octaveFrequency: rawOctave,
      octaveCents,
      compoundFifthFrequency: rawCFifth,
      compoundFifthCents,
      capturedAt: Date.now(),
    };

    justRegistered.current = true;

    if (!lockedNoteName) {
      dispatch({ type: 'SET_LOCKED_NOTE_NAME', payload: { noteIndex, noteName: parsed.fullName } });
    }

    dispatch({ type: 'RECORD_STRIKE', payload: { noteIndex, strike } });
    setInstructionText(`Strike ${parsed.fullName} again (${Math.min(3, currentStrikes.length + 2)}/3)`);

    setTimeout(() => {
      resetCaptureState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [currentStrikes.length, dispatch, lockedNoteName, noteComplete, noteIndex, resetCaptureState, result]);

  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const shouldRegister = stabilityPct >= 98 || lockQuality >= LOCK_THRESHOLD_REGISTER;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const liveNoteParsed = useMemo(() => {
    const sourceName = lockedNoteName ?? result.noteName ?? null;
    return sourceName ? parseFullNoteName(sourceName) : null;
  }, [lockedNoteName, result.noteName]);


  useEffect(() => {
    if (!isListening || noteComplete) return;
    if (result.frequency === null || result.noteName === null) return;

    const detectedName = result.noteName;
    const now = performance.now();

    if (lockedNoteName && detectedName !== lockedNoteName) {
      setInstructionText(`Keep striking ${lockedNoteName}. A different note is being heard now.`);
      return;
    }

    if (collectingNoteName.current !== detectedName) {
      stableFrequencies.current = [];
      stableOctaveFreqs.current = [];
      stableCFifthFreqs.current = [];
      noteCaptureStartedAt.current = 0;
      noteWaitingForPartials.current = null;
      sameNoteSince.current = now;
    }
    collectingNoteName.current = detectedName;

    if ((result.lockQuality ?? 0) >= 0.55) {
      stableFrequencies.current.push(result.frequency);
      if (noteCaptureStartedAt.current === 0) {
        noteCaptureStartedAt.current = now;
      }
    }

    if (result.octaveFrequency !== null) stableOctaveFreqs.current.push(result.octaveFrequency);
    if (result.compoundFifthFrequency !== null) stableCFifthFreqs.current.push(result.compoundFifthFrequency);

    const captureAgeMs = noteCaptureStartedAt.current > 0 ? now - noteCaptureStartedAt.current : 0;
    const enoughPartials = hasEnoughPartialEvidence(stableOctaveFreqs.current, stableCFifthFreqs.current);

    if (noteWaitingForPartials.current === detectedName && !enoughPartials) {
      setInstructionText(
        captureAgeMs >= PARTIAL_EXTRA_HOLD_MS
          ? 'Hold the note a little longer for stronger partial confirmation'
          : 'Listening for octave and compound fifth confirmation…',
      );
    } else if (!lockedNoteName) {
      setInstructionText(`Strike any note cleanly — this will become note ${noteIndex + 1}`);
    } else {
      setInstructionText(`Strike ${lockedNoteName} cleanly — strike ${strikeNumber} of 3`);
    }

    if (shouldRegister && !justRegistered.current) {
      const sameNoteAgeMs = now - sameNoteSince.current;

      if (!enoughPartials && captureAgeMs < PARTIAL_MAX_WAIT_MS && sameNoteAgeMs >= SAME_NOTE_GRACE_MS) {
        noteWaitingForPartials.current = detectedName;
        setInstructionText(
          captureAgeMs >= PARTIAL_EXTRA_HOLD_MS
            ? 'Try one more clean strike for stronger partial confidence'
            : 'Hold the note ringing a little longer for partial confirmation',
        );
        return;
      }

      noteWaitingForPartials.current = null;
      registerStrike();
    }
  }, [
    isListening,
    lockedNoteName,
    noteComplete,
    noteIndex,
    registerStrike,
    result,
    shouldRegister,
    strikeNumber,
  ]);

  const progressPct = notesCount > 0 ? ((noteIndex + (noteComplete ? 1 : 0)) / notesCount) * 100 : 0;

  const currentStrikePreview = useMemo(() => {
    const rows = currentStrikes.map((strike, index) => ({
      id: index,
      strike,
      color: strike.cents !== null ? centsToColor(strike.cents) : '#666',
    }));
    return rows;
  }, [currentStrikes]);

  const handleNext = () => {
    if (allDone || noteIndex >= notesCount - 1) {
      stopListening();
      navigate('/certification/results');
      return;
    }
    dispatch({ type: 'ADVANCE_TO_NEXT_NOTE' });
  };

  const handleRetryLastStrike = () => {
    if (!currentStrikes.length) return;
    dispatch({ type: 'REMOVE_LAST_STRIKE', payload: { noteIndex } });
    if (currentStrikes.length <= 1) {
      dispatch({ type: 'SET_LOCKED_NOTE_NAME', payload: { noteIndex, noteName: null } });
    }
    resetCaptureState();
  };

  const handleRestartNote = () => {
    dispatch({ type: 'RESET_CURRENT_NOTE', payload: { noteIndex } });
    resetCaptureState();
  };

  const toggleCompoundExpectation = () => {
    dispatch({
      type: 'SET_NOTE_EXPECTATIONS',
      payload: { noteIndex, expectations: { compoundFifth: !currentExpectations.compoundFifth } },
    });
  };

  return (
    <div className="page certification-check-page">
      <div className="page-header">
        <div className="tuning-progress-bar">
          <div className="tuning-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="progress-label">Note {noteIndex + 1} of {notesCount} · Strike {Math.min(strikeNumber, 3)} of 3</p>
      </div>

      <div className="note-prompt-card">
        <div className="note-zone-label">Certification mode</div>
        <div className="note-prompt-name" style={{ color: statusColor }}>
          {lockedNoteName ?? result.noteName ?? '—'}
        </div>
        {result.frequency !== null && <div className="note-prompt-freq">{result.frequency.toFixed(2)} Hz</div>}
        <p className="note-instruction">{instructionText}</p>
      </div>

      <div className="cert-toggle-row">
        <button className={`btn ${currentExpectations.compoundFifth ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleCompoundExpectation}>
          {currentExpectations.compoundFifth ? 'Mark this note as octave-only' : 'Compound fifth not expected'}
        </button>
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
              style={{ strokeDasharray: `${stabilityPct * 2.764} ${276.4}`, stroke: statusColor }}
            />
          </svg>
          <div className="stability-center">
            {stabilityPct > 0 ? <span className="stability-pct" style={{ color: statusColor }}>{stabilityPct}%</span> : <span className="stability-idle">🎵</span>}
          </div>
        </div>

        <div className="tuning-readings">
          {result.frequency !== null ? (
            <>
              <div className="reading-row"><span className="reading-label">Fundamental</span><span className="reading-value">{result.cents !== null ? formatCents(result.cents) : '—'}</span></div>
              <div className="reading-row"><span className="reading-label">Octave</span><span className="reading-value">{result.octaveFrequency !== null && liveNoteParsed ? formatCents(1200 * Math.log2(result.octaveFrequency / midiToFrequency(liveNoteParsed.midiNote + 12))) : '—'}</span></div>
              <div className="reading-row"><span className="reading-label">Compound 5th</span><span className="reading-value">{result.compoundFifthFrequency !== null && liveNoteParsed ? formatCents(1200 * Math.log2(result.compoundFifthFrequency / midiToFrequency(liveNoteParsed.midiNote + 19))) : '—'}</span></div>
            </>
          ) : (
            <div className="listening-placeholder">{isListening ? '🎵 Listening…' : 'Starting microphone…'}</div>
          )}
        </div>
      </div>

      <CentsGauge cents={result.cents} label="Fundamental cents" />

      {error && <div className="error-banner">{error}</div>}

      <div className="cert-strikes-panel">
        <h3 className="registered-notes-title">Current note strikes</h3>
        {currentStrikePreview.length === 0 ? (
          <div className="cert-muted">No strikes captured yet.</div>
        ) : (
          currentStrikePreview.map(({ id, strike, color }) => (
            <div key={id} className="registered-note-row cert-strike-row">
              <span className="reg-note-name">#{id + 1}</span>
              <span className="reg-note-cents" style={{ color }}>{strike.noteName} · {strike.cents !== null ? formatCents(strike.cents) : '—'}</span>
              <span className="cert-mini-partial">Oct {strike.octaveCents !== null ? formatCents(strike.octaveCents) : 'Inconclusive'}</span>
              <span className="cert-mini-partial">5th {strike.compoundFifthCents !== null ? formatCents(strike.compoundFifthCents) : (currentExpectations.compoundFifth ? 'Inconclusive' : 'N/A')}</span>
            </div>
          ))
        )}
      </div>

      {currentAggregate && currentStrikes.length > 0 && (
        <div className="cert-summary-card">
          <h3>{currentAggregate.noteName} provisional certification</h3>
          <div className="cert-summary-grid">
            <div className="cert-summary-row"><span>Fundamental</span><strong>{currentAggregate.fundamental.cents !== null ? formatCents(currentAggregate.fundamental.cents) : 'Inconclusive'}</strong></div>
            <div className="cert-summary-row"><span>Octave</span><strong>{currentAggregate.octave.status === 'measured' && currentAggregate.octave.cents !== null ? formatCents(currentAggregate.octave.cents) : currentAggregate.octave.status === 'not-expected' ? 'N/A' : 'Inconclusive'}</strong></div>
            <div className="cert-summary-row"><span>Compound fifth</span><strong>{currentAggregate.compoundFifth.status === 'measured' && currentAggregate.compoundFifth.cents !== null ? formatCents(currentAggregate.compoundFifth.cents) : currentAggregate.compoundFifth.status === 'not-expected' ? 'N/A' : 'Inconclusive'}</strong></div>
            <div className="cert-summary-row"><span>Confidence</span><strong>{currentAggregate.overallConfidence}</strong></div>
          </div>
        </div>
      )}

      <div className="page-actions certification-actions">
        <button className="btn btn-ghost" onClick={() => navigate('/certification/start')}>Back</button>
        <button className="btn btn-secondary" onClick={handleRetryLastStrike} disabled={!currentStrikes.length}>Retry last strike</button>
        <button className="btn btn-secondary" onClick={handleRestartNote}>Restart note</button>
        <button className="btn btn-primary" onClick={handleNext} disabled={!noteComplete && !allDone}>
          {allDone || noteIndex >= notesCount - 1 ? 'View certified results' : 'Next note'}
        </button>
      </div>
    </div>
  );
};

export default CertificationCheckPage;
