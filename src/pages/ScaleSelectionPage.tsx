import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { midiToFrequency } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

interface ScaleDefinition {
  name: string;
  notes: { name: string; midi: number }[];
}

const HANDPAN_SCALES: ScaleDefinition[] = [
  {
    name: 'D Aeolian',
    notes: [
      { name: 'D3', midi: 50 }, { name: 'A3', midi: 57 }, { name: 'Bb3', midi: 58 },
      { name: 'C4', midi: 60 }, { name: 'D4', midi: 62 }, { name: 'E4', midi: 64 },
      { name: 'F4', midi: 65 }, { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 },
    ],
  },
  {
    name: 'E Phrygian',
    notes: [
      { name: 'E3', midi: 52 }, { name: 'B3', midi: 59 }, { name: 'C4', midi: 60 },
      { name: 'D4', midi: 62 }, { name: 'E4', midi: 64 }, { name: 'F4', midi: 65 },
      { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 }, { name: 'B4', midi: 71 },
    ],
  },
  {
    name: 'F Dorian',
    notes: [
      { name: 'F3', midi: 53 }, { name: 'C4', midi: 60 }, { name: 'Db4', midi: 61 },
      { name: 'Eb4', midi: 63 }, { name: 'F4', midi: 65 }, { name: 'G4', midi: 67 },
      { name: 'Ab4', midi: 68 }, { name: 'Bb4', midi: 70 }, { name: 'C5', midi: 72 },
    ],
  },
  {
    name: 'G Dorian',
    notes: [
      { name: 'G3', midi: 55 }, { name: 'D4', midi: 62 }, { name: 'E4', midi: 64 },
      { name: 'F4', midi: 65 }, { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 },
      { name: 'Bb4', midi: 70 }, { name: 'C5', midi: 72 }, { name: 'D5', midi: 74 },
    ],
  },
  {
    name: 'A Dorian',
    notes: [
      { name: 'A3', midi: 57 }, { name: 'E4', midi: 64 }, { name: 'F#4', midi: 66 },
      { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 }, { name: 'B4', midi: 71 },
      { name: 'C5', midi: 72 }, { name: 'D5', midi: 74 }, { name: 'E5', midi: 76 },
    ],
  },
  {
    name: 'B Dorian',
    notes: [
      { name: 'B3', midi: 59 }, { name: 'F#4', midi: 66 }, { name: 'G#4', midi: 68 },
      { name: 'A4', midi: 69 }, { name: 'B4', midi: 71 }, { name: 'C#5', midi: 73 },
      { name: 'D5', midi: 74 }, { name: 'E5', midi: 76 }, { name: 'F#5', midi: 78 },
    ],
  },
  {
    name: 'C Dorian',
    notes: [
      { name: 'C4', midi: 60 }, { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 },
      { name: 'Bb4', midi: 70 }, { name: 'C5', midi: 72 }, { name: 'D5', midi: 74 },
      { name: 'Eb5', midi: 75 }, { name: 'F5', midi: 77 }, { name: 'G5', midi: 79 },
    ],
  },
  {
    name: 'D Phrygian',
    notes: [
      { name: 'D3', midi: 50 }, { name: 'A3', midi: 57 }, { name: 'Bb3', midi: 58 },
      { name: 'C4', midi: 60 }, { name: 'D4', midi: 62 }, { name: 'Eb4', midi: 63 },
      { name: 'F4', midi: 65 }, { name: 'G4', midi: 67 }, { name: 'A4', midi: 69 },
    ],
  },
];

export { HANDPAN_SCALES };
export type { ScaleDefinition };

const ScaleSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useAppContext();
  const [knowsScale, setKnowsScale] = useState<boolean | null>(null);
  const [selectedScale, setSelectedScale] = useState<string>(HANDPAN_SCALES[0].name);

  const handleNext = () => {
    if (knowsScale === true) {
      const scale = HANDPAN_SCALES.find(s => s.name === selectedScale)!;
      const initialResults: TuningResult[] = scale.notes.map(note => ({
        noteName: note.name,
        targetFrequency: midiToFrequency(note.midi),
        detectedFrequency: null,
        cents: null,
        status: 'pending',
      }));
      dispatch({ type: 'SET_SCALE', payload: selectedScale });
      initialResults.forEach((r, i) => {
        dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: i });
        dispatch({ type: 'ADD_TUNING_RESULT', payload: r });
      });
      dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: 0 });
      navigate('/guided-tuning');
    } else if (knowsScale === false) {
      alert('Scale identification feature coming soon! Please select a known scale to continue.');
      setKnowsScale(null);
    }
  };

  return (
    <div className="page scale-selection-page">
      <div className="page-header">
        <div className="progress-indicator">
          <span className="progress-step active">1</span>
          <span className="progress-line"></span>
          <span className="progress-step">2</span>
          <span className="progress-line"></span>
          <span className="progress-step">3</span>
          <span className="progress-line"></span>
          <span className="progress-step">4</span>
          <span className="progress-line"></span>
          <span className="progress-step">5</span>
        </div>
        <p className="progress-label">Step 1 of 5 — Scale Selection</p>
      </div>

      <div className="page-content">
        <h2 className="page-title">Do you know your handpan scale?</h2>

        <div className="scale-choice">
          <button
            className={`choice-btn ${knowsScale === true ? 'active' : ''}`}
            onClick={() => setKnowsScale(true)}
          >
            ✓ Yes, I know my scale
          </button>
          <button
            className={`choice-btn ${knowsScale === false ? 'active' : ''}`}
            onClick={() => setKnowsScale(false)}
          >
            🔍 Identify my scale
            <span className="badge-lock">🔒 Pro</span>
          </button>
        </div>

        {knowsScale === true && (
          <div className="scale-dropdown-container">
            <label className="dropdown-label" htmlFor="scale-select">Select your scale:</label>
            <select
              id="scale-select"
              className="scale-select"
              value={selectedScale}
              onChange={e => setSelectedScale(e.target.value)}
            >
              {HANDPAN_SCALES.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="page-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← Back</button>
        <button
          className="btn btn-primary"
          onClick={handleNext}
          disabled={knowsScale === null}
        >
          Next →
        </button>
      </div>
    </div>
  );
};

export default ScaleSelectionPage;
