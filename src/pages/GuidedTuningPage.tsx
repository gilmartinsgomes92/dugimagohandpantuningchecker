import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { StrobeDisk } from '../components/StrobeDisk';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor } from '../utils/musicUtils';
import { HANDPAN_SCALES } from './ScaleSelectionPage';

const GuidedTuningPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening } = useAudioProcessor();

  const scale = HANDPAN_SCALES.find(s => s.name === state.selectedScale);
  const currentNote = scale?.notes[state.currentNoteIndex];
  const totalNotes = scale?.notes.length ?? 0;
  const noteIndex = state.currentNoteIndex;

  useEffect(() => {
    if (!state.selectedScale) navigate('/scale-selection');
  }, [state.selectedScale, navigate]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const getTuningStatus = useCallback((cents: number | null) => {
    if (cents === null) return null;
    const abs = Math.abs(cents);
    if (abs <= 7) return { label: '✅ In Tune', className: 'status-in-tune' };
    if (abs <= 15) return { label: `⚠️ Slightly Out of Tune (${formatCents(cents)})`, className: 'status-slightly-out' };
    return { label: `❌ Out of Tune (${formatCents(cents)})`, className: 'status-out-of-tune' };
  }, []);

  const confirmNote = useCallback(() => {
    if (!currentNote) return;
    const cents = result.cents;
    const detectedFreq = result.frequency;
    const targetFreq = midiToFrequency(currentNote.midi);
    const abs = cents !== null ? Math.abs(cents) : Infinity;
    const status = cents === null ? 'pending' : abs <= 7 ? 'in-tune' : abs <= 15 ? 'slightly-out-of-tune' : 'out-of-tune';

    dispatch({
      type: 'ADD_TUNING_RESULT',
      payload: {
        noteName: currentNote.name,
        targetFrequency: targetFreq,
        detectedFrequency: detectedFreq,
        cents,
        status,
      },
    });

    stopListening();
    if (noteIndex + 1 < totalNotes) {
      dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });
    } else {
      navigate('/results');
    }
  }, [currentNote, result, noteIndex, totalNotes, dispatch, stopListening, navigate]);

  const skipNote = useCallback(() => {
    if (!currentNote) return;
    dispatch({
      type: 'ADD_TUNING_RESULT',
      payload: {
        noteName: currentNote.name,
        targetFrequency: midiToFrequency(currentNote.midi),
        detectedFrequency: null,
        cents: null,
        status: 'skipped',
      },
    });
    stopListening();
    if (noteIndex + 1 < totalNotes) {
      dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });
    } else {
      navigate('/results');
    }
  }, [currentNote, noteIndex, totalNotes, dispatch, stopListening, navigate]);

  if (!scale || !currentNote) return null;

  const targetFreq = midiToFrequency(currentNote.midi);
  const tuningStatus = getTuningStatus(result.cents);
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const isConfirmable = result.frequency !== null;

  const progressPct = (noteIndex / totalNotes) * 100;

  return (
    <div className="page guided-tuning-page">
      <div className="page-header">
        <div className="tuning-progress-bar">
          <div className="tuning-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="progress-label">Note {noteIndex + 1} of {totalNotes} — {scale.name}</p>
      </div>

      <div className="note-prompt-card">
        <div className="note-zone-label">Play this note:</div>
        <div className="note-prompt-name" style={{ color: statusColor }}>{currentNote.name}</div>
        <div className="note-prompt-freq">{targetFreq.toFixed(2)} Hz</div>
        <p className="note-instruction">Strike the note on your handpan and hold it ringing</p>
      </div>

      <div className="tuning-display">
        <StrobeDisk
          detectedFreq={result.frequency}
          referenceFreq={targetFreq}
          label={currentNote.name}
          active={isListening && result.frequency !== null}
          size={180}
        />

        <div className="tuning-readings">
          {result.frequency !== null ? (
            <>
              <div className="reading-row">
                <span className="reading-label">Detected:</span>
                <span className="reading-value">{result.frequency.toFixed(2)} Hz</span>
              </div>
              <div className="reading-row">
                <span className="reading-label">Note:</span>
                <span className="reading-value">{result.noteName}</span>
              </div>
              <div className="reading-row">
                <span className="reading-label">Deviation:</span>
                <span className="reading-value" style={{ color: statusColor }}>
                  {result.cents !== null ? formatCents(result.cents) : '—'}
                </span>
              </div>
              {tuningStatus && (
                <div className={`tuning-status-badge ${tuningStatus.className}`}>
                  {tuningStatus.label}
                </div>
              )}
            </>
          ) : (
            <div className="listening-placeholder">
              {isListening ? (
                <span className="listening-anim">🎵 Listening…</span>
              ) : (
                <span>Press Start to begin</span>
              )}
            </div>
          )}
        </div>
      </div>

      <CentsGauge cents={result.cents} label="Cents deviation" />

      {error && <div className="error-banner">{error}</div>}

      <div className="mic-controls">
        <button
          className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
          onClick={isListening ? stopListening : startListening}
        >
          {isListening ? '⏹ Stop Microphone' : '🎤 Start Microphone'}
        </button>
      </div>

      <div className="page-actions">
        <button
          className="btn btn-secondary"
          onClick={() => {
            stopListening();
            if (noteIndex > 0) {
              dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex - 1 });
            } else {
              navigate('/scale-selection');
            }
          }}
        >
          ← Back
        </button>
        <button className="btn btn-ghost" onClick={skipNote}>Skip</button>
        <button
          className="btn btn-primary"
          onClick={confirmNote}
          disabled={!isConfirmable}
        >
          Confirm →
        </button>
      </div>
    </div>
  );
};

export default GuidedTuningPage;
