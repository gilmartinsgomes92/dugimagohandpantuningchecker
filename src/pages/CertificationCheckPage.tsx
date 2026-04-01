import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { useCertificationAggregates, useCertificationContext } from '../contexts/CertificationContext';
import { CentsGauge } from '../components/CentsGauge';
import { centsToColor, formatCents, midiToFrequency } from '../utils/musicUtils';
import type { CertificationStrike } from '../types/certification';

const REGISTRATION_COOLDOWN_MS = 700;
const STRIKE_RELEASE_MS = 700;
const SESSION_MIN_MS = 550;
const MIN_FUNDAMENTAL_SAMPLES = 4;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const LOCK_THRESHOLD_START = IS_IOS ? 0.58 : 0.64;
const LOCK_THRESHOLD_DISPLAY = IS_IOS ? 0.55 : 0.60;
const HIGH_NOTE_OCTAVE_ONLY_MIDI = 76; // E5 and above default to octave-only in certified mode

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
  const trimCount = Math.floor(sorted.length * 0.2);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return trimmed.length > 0
    ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
    : sorted[Math.floor((sorted.length - 1) / 2)];
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
  const hasMinimumStrikes = currentStrikes.length >= 3;
  const completedNoteNames = useMemo(() => new Set(
    aggregates
      .map((aggregate, index) => ({ aggregate, index }))
      .filter(({ aggregate, index }) => index !== noteIndex && aggregate.strikeCount >= 3 && aggregate.noteName !== 'Unknown')
      .map(({ aggregate }) => aggregate.noteName),
  ), [aggregates, noteIndex]);

  const stableFrequencies = useRef<number[]>([]);
  const stableOctaveFreqs = useRef<number[]>([]);
  const stableCFifthFreqs = useRef<number[]>([]);
  const strikeSessionActive = useRef(false);
  const collectingNoteName = useRef<string | null>(null);
  const sessionStartedAt = useRef<number>(0);
  const sessionLastSeenAt = useRef<number>(0);
  const justRegistered = useRef(false);

  const [instructionText, setInstructionText] = useState('Play one clean strike and let the note ring until it fades');
  const [compoundExpectationTouched, setCompoundExpectationTouched] = useState<Record<number, boolean>>({});


  const resetCaptureState = useCallback(() => {
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
    strikeSessionActive.current = false;
    collectingNoteName.current = null;
    sessionStartedAt.current = 0;
    sessionLastSeenAt.current = 0;
    setInstructionText('Play one clean strike and let the note ring until it fades');
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


  const registerStrike = useCallback((capturedNoteName: string) => {
    if (justRegistered.current) return;

    const detectedFreq = trimmedMean(stableFrequencies.current) ?? result.frequency;
    if (detectedFreq === null) return;

    const parsed = parseFullNoteName(capturedNoteName);
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
    setInstructionText(`Captured strike ${Math.min(3, currentStrikes.length + 1)}/3 for ${parsed.fullName}`);

    setTimeout(() => {
      resetCaptureState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [currentStrikes.length, dispatch, lockedNoteName, noteIndex, resetCaptureState, result.frequency]);

  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(Math.min(1, lockQuality / LOCK_THRESHOLD_DISPLAY) * 100);
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const liveNoteParsed = useMemo(() => {
    const sourceName = collectingNoteName.current ?? lockedNoteName ?? result.noteName ?? null;
    return sourceName ? parseFullNoteName(sourceName) : null;
  }, [lockedNoteName, result.noteName]);

  const currentNoteMidi = liveNoteParsed?.midiNote ?? (lockedNoteName ? parseFullNoteName(lockedNoteName)?.midiNote ?? null : null);
  const isHighNoteDefaultOctaveOnly = currentNoteMidi !== null && currentNoteMidi >= HIGH_NOTE_OCTAVE_ONLY_MIDI;
  const effectiveCompoundFifthExpected = isHighNoteDefaultOctaveOnly && !compoundExpectationTouched[noteIndex]
    ? false
    : currentExpectations.compoundFifth;

  const currentNoteIsCertifiable = useMemo(() => {
    if (!currentAggregate || currentStrikes.length < 3) return false;

    const fundamentalReady = currentAggregate.fundamental.status === 'measured';
    const octaveReady = !currentExpectations.octave || currentAggregate.octave.status === 'measured';
    const compoundReady = !effectiveCompoundFifthExpected || currentAggregate.compoundFifth.status === 'measured';

    return fundamentalReady && octaveReady && compoundReady;
  }, [currentAggregate, currentExpectations.octave, currentStrikes.length, effectiveCompoundFifthExpected]);


  const noteComplete = hasMinimumStrikes && currentNoteIsCertifiable;
  const allDone = notesCount > 0 && state.strikesByNote.every((noteStrikes, index) => {
    if (noteStrikes.length < 3) return false;
    const aggregate = aggregates[index];
    const expectations = state.expectationsByNote[index] ?? { octave: true, compoundFifth: true };
    if (!aggregate) return false;

    const fundamentalReady = aggregate.fundamental.status === 'measured';
    const octaveReady = !expectations.octave || aggregate.octave.status === 'measured';
    const compoundReady = !expectations.compoundFifth || aggregate.compoundFifth.status === 'measured';

    return fundamentalReady && octaveReady && compoundReady;
  });

  useEffect(() => {
    if (!isHighNoteDefaultOctaveOnly || compoundExpectationTouched[noteIndex] || !currentExpectations.compoundFifth) return;

    dispatch({
      type: 'SET_NOTE_EXPECTATIONS',
      payload: { noteIndex, expectations: { compoundFifth: false } },
    });
  }, [compoundExpectationTouched, currentExpectations.compoundFifth, dispatch, isHighNoteDefaultOctaveOnly, noteIndex]);

  useEffect(() => {
    if (!isListening || noteComplete || justRegistered.current) return;

    const now = performance.now();
    const detectedName = result.noteName;
    const detectedFreq = result.frequency;
    const targetName = collectingNoteName.current ?? lockedNoteName;
    const noteMatchesTarget = detectedName !== null && (!targetName || detectedName === targetName);

    if (!strikeSessionActive.current) {
      if (hasMinimumStrikes && !currentNoteIsCertifiable) {
        if (lockedNoteName) {
          setInstructionText(`This note was not measured clearly enough for certification. Please strike ${lockedNoteName} again to continue.`);
        } else {
          setInstructionText('This note was not measured clearly enough for certification. Please strike this note again to continue.');
        }
      }
      if (!lockedNoteName && detectedName !== null && completedNoteNames.has(detectedName)) {
        setInstructionText(`${detectedName} is already fully certified. Play a different note to continue.`);
        return;
      }

      if (
        detectedFreq !== null
        && detectedName !== null
        && noteMatchesTarget
        && lockQuality >= LOCK_THRESHOLD_START
      ) {
        strikeSessionActive.current = true;
        collectingNoteName.current = detectedName;
        sessionStartedAt.current = now;
        sessionLastSeenAt.current = now;
        stableFrequencies.current = [detectedFreq];
        stableOctaveFreqs.current = result.octaveFrequency !== null ? [result.octaveFrequency] : [];
        stableCFifthFreqs.current = result.compoundFifthFrequency !== null ? [result.compoundFifthFrequency] : [];
        setInstructionText(`Capturing strike ${Math.min(currentStrikes.length + 1, 3)}/3 — let ${detectedName} ring and fade before the next strike`);
      } else if (lockedNoteName && detectedName && detectedName !== lockedNoteName) {
        setInstructionText(`Please play ${lockedNoteName}. A different note is being heard now.`);
      } else if (lockedNoteName) {
        setInstructionText(`Play ${lockedNoteName} cleanly and let it fully ring out — strike ${strikeNumber} of 3`);
      } else {
        setInstructionText(`Play any clean note and let it fully ring out — strike ${strikeNumber} of 3`);
      }
      return;
    }

    const sessionNoteName = collectingNoteName.current;
    const sameSessionNote = detectedFreq !== null && detectedName !== null && detectedName === sessionNoteName;

    if (sameSessionNote) {
      sessionLastSeenAt.current = now;
      stableFrequencies.current.push(detectedFreq);
      if (result.octaveFrequency !== null) stableOctaveFreqs.current.push(result.octaveFrequency);
      if (result.compoundFifthFrequency !== null) stableCFifthFreqs.current.push(result.compoundFifthFrequency);
      setInstructionText(`Listening through the fade of ${sessionNoteName} — partials are still being measured`);
      return;
    }

    const sessionAgeMs = now - sessionStartedAt.current;
    const releaseAgeMs = now - sessionLastSeenAt.current;

    if (releaseAgeMs < STRIKE_RELEASE_MS) {
      setInstructionText(`Hold before the next strike — finalizing strike ${Math.min(currentStrikes.length + 1, 3)}/3…`);
      return;
    }

    if (sessionNoteName && sessionAgeMs >= SESSION_MIN_MS && stableFrequencies.current.length >= MIN_FUNDAMENTAL_SAMPLES) {
      registerStrike(sessionNoteName);
      return;
    }

    resetCaptureState();
  }, [
    currentNoteIsCertifiable,
    currentStrikes.length,
    hasMinimumStrikes,
    isListening,
    lockQuality,
    completedNoteNames,
    lockedNoteName,
    noteComplete,
    registerStrike,
    resetCaptureState,
    result.compoundFifthFrequency,
    result.frequency,
    result.noteName,
    result.octaveFrequency,
    strikeNumber,
  ]);

  const progressPct = notesCount > 0 ? ((noteIndex + (noteComplete ? 1 : 0)) / notesCount) * 100 : 0;

  const needsMoreCertification = hasMinimumStrikes && !currentNoteIsCertifiable;

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
      navigate('/certification/review');
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
    setCompoundExpectationTouched((prev) => ({ ...prev, [noteIndex]: false }));
    resetCaptureState();
  };

  const toggleCompoundExpectation = () => {
    setCompoundExpectationTouched((prev) => ({ ...prev, [noteIndex]: true }));
    dispatch({
      type: 'SET_NOTE_EXPECTATIONS',
      payload: { noteIndex, expectations: { compoundFifth: !effectiveCompoundFifthExpected } },
    });
  };

  return (
    <div className="page certification-check-page">
      <div className="page-header">
        <div className="tuning-progress-bar">
          <div className="tuning-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="progress-label">Note {noteIndex + 1} of {notesCount} · Strike {currentStrikes.length < 3 ? currentStrikes.length + 1 : 3} of 3</p>
      </div>

      <div className="note-prompt-card">
        <div className="note-zone-label">Certification mode</div>
        <div className="note-prompt-name" style={{ color: statusColor }}>
          {collectingNoteName.current ?? lockedNoteName ?? result.noteName ?? '—'}
        </div>
        {result.frequency !== null && <div className="note-prompt-freq">{result.frequency.toFixed(2)} Hz</div>}
        <p className="note-instruction">{instructionText}</p>
      </div>

      <div className="cert-toggle-row">
        <button className={`btn ${effectiveCompoundFifthExpected ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleCompoundExpectation}>
          {effectiveCompoundFifthExpected ? 'Mark this note as octave-only' : (isHighNoteDefaultOctaveOnly ? 'Mark this note as octave and compound fifth' : 'Compound fifth not expected')}
        </button>
      </div>

      {needsMoreCertification && (
        <div className="warning-banner">
          <strong>This note was not measured clearly enough for certification.</strong> Please strike this note again to continue.
        </div>
      )}

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
              <div className="reading-row"><span className="reading-label">Compound 5th</span><span className="reading-value">{effectiveCompoundFifthExpected && result.compoundFifthFrequency !== null && liveNoteParsed ? formatCents(1200 * Math.log2(result.compoundFifthFrequency / midiToFrequency(liveNoteParsed.midiNote + 19))) : (effectiveCompoundFifthExpected ? '—' : 'N/A')}</span></div>
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
              <span className="cert-mini-partial">5th {strike.compoundFifthCents !== null && effectiveCompoundFifthExpected ? formatCents(strike.compoundFifthCents) : (effectiveCompoundFifthExpected ? 'Inconclusive' : 'N/A')}</span>
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
