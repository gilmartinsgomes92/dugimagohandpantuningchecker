/**
 * TuningStartPage – Entry point for the guided 2-step tuning workflow.
 *
 * Asks the user how many notes are on their handpan, then dispatches
 * START_TUNING_SESSION and navigates to /tuning/identify-note.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

const NOTE_COUNTS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const TuningStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useAppContext();

  const handleSelect = (count: number) => {
    dispatch({ type: 'START_TUNING_SESSION', payload: { notesCount: count } });
    navigate('/tuning/identify-note');
  };

  return (
    <div className="page notes-count-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="notes-count-content">
        <h2 className="notes-count-title">How many notes does your handpan have?</h2>
        <p className="notes-count-subtitle">
          We'll guide you through tuning each note one by one.
        </p>

        <div className="notes-count-grid">
          {NOTE_COUNTS.map(count => (
            <button
              key={count}
              className="btn btn-primary notes-count-btn"
              onClick={() => handleSelect(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TuningStartPage;
