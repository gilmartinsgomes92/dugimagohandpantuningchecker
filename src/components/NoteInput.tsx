/**
 * NoteInput – pre-measurement note selector.
 *
 * Provides a dropdown for selecting the expected note name and a confirm
 * button to begin the measurement.
 */

import React, { useState } from 'react';

// Chromatic note names spanning the typical handpan range D3–C6
const NOTES = [
  'D3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
  'C6',
];

interface NoteInputProps {
  /** Currently selected note (controlled). */
  value: string;
  /** Called when the user changes the selected note. */
  onChange: (note: string) => void;
  /** Called when the user confirms and wants to start recording. */
  onConfirm: () => void;
  /** Whether the confirm button should be disabled (e.g. already recording). */
  disabled?: boolean;
}

export function NoteInput({ value, onChange, onConfirm, disabled = false }: NoteInputProps) {
  const [localValue, setLocalValue] = useState(value || NOTES[0]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalValue(e.target.value);
    onChange(e.target.value);
  };

  const handleConfirm = () => {
    onChange(localValue);
    onConfirm();
  };

  return (
    <div className="note-input">
      <label className="note-input-label" htmlFor="note-select">
        Select expected note
      </label>
      <div className="note-input-row">
        <select
          id="note-select"
          className="note-input-select"
          value={localValue}
          onChange={handleChange}
          disabled={disabled}
        >
          {NOTES.map(note => (
            <option key={note} value={note}>
              {note}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary note-input-confirm"
          onClick={handleConfirm}
          disabled={disabled}
        >
          Start Measurement
        </button>
      </div>
    </div>
  );
}
