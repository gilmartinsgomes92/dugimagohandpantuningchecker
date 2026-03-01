/**
 * TunerInterface – main tuning interface component.
 *
 * Integrates NoteInput, FrequencyVisualizer, TuningResults and the CentsGauge
 * into a single cohesive measurement UI.  Uses the useTuner hook internally.
 */

import { useState } from 'react';
import { useTuner } from '../hooks/useTuner';
import { NoteInput } from './NoteInput';
import { FrequencyVisualizer } from './FrequencyVisualizer';
import { TuningResults } from './TuningResults';
import { CentsGauge } from './CentsGauge';

interface TunerInterfaceProps {
  /** Display name for the instrument being tuned. */
  handpanName?: string;
}

export function TunerInterface({ handpanName = 'My Handpan' }: TunerInterfaceProps) {
  const {
    isRecording,
    liveResult,
    error,
    startRecording,
    stopRecording,
    saveMeasurementNow,
  } = useTuner(handpanName);

  const [selectedNote, setSelectedNote] = useState('D3');
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleStartMeasurement = async () => {
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
  };

  const handleSave = () => {
    saveMeasurementNow(selectedNote);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);
  };

  return (
    <div className="tuner-interface">
      <div className="tuner-interface-header">
        <h2 className="tuner-interface-title">Handpan Tuner</h2>
        <p className="tuner-interface-subtitle">
          Select the expected note, strike the tonefield, and read the deviation below.
        </p>
      </div>

      {error && (
        <div className="tuner-error" role="alert">
          ⚠️ {error}
        </div>
      )}

      <NoteInput
        value={selectedNote}
        onChange={setSelectedNote}
        onConfirm={() => void handleStartMeasurement()}
        disabled={isRecording}
      />

      <div className="tuner-status">
        {isRecording ? (
          <span className="tuner-status-recording">🔴 Recording – strike a tonefield now</span>
        ) : (
          <span className="tuner-status-idle">⬤ Idle – select a note and press Start Measurement</span>
        )}
      </div>

      {isRecording && (
        <button className="btn btn-secondary tuner-stop-btn" onClick={handleStop}>
          ■ Stop Recording
        </button>
      )}

      <FrequencyVisualizer
        spectrum={liveResult.spectrum}
        fundamentalFreq={liveResult.fundamentalFreq}
      />

      <CentsGauge cents={liveResult.fundamentalCents} label="Fundamental" />

      <TuningResults result={liveResult} />

      {isRecording && liveResult.fundamentalFreq !== null && (
        <button
          className="btn btn-primary tuner-save-btn"
          onClick={handleSave}
          disabled={savedFeedback}
        >
          {savedFeedback ? '✅ Saved!' : '💾 Save Measurement'}
        </button>
      )}

      <div className="tuner-instructions">
        <h3>How to use</h3>
        <ol>
          <li>Select the note you are about to play from the dropdown.</li>
          <li>Press <strong>Start Measurement</strong> – the app will request microphone access.</li>
          <li>Strike the tonefield and let the note ring for 5–10 seconds.</li>
          <li>Read the deviation in cents (green = in tune, red = out of tune).</li>
          <li>Press <strong>Save Measurement</strong> to store the result, then repeat for each note.</li>
          <li>Press <strong>Stop Recording</strong> when done.</li>
        </ol>
      </div>
    </div>
  );
}
