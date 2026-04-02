import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

const NOTE_COUNTS = Array.from({ length: 24 }, (_, index) => index + 7);

const NotesCountSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useAppContext();

  const handleSelect = (count: number) => {
    dispatch({ type: 'SET_SCALE', payload: 'Quick Tuning Check' });
    dispatch({ type: 'SET_NOTES_COUNT', payload: count });
    navigate('/quick-tuning');
  };

  return (
    <div className="page notes-count-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="notes-count-content">
        <h2 className="notes-count-title">How many notes does your handpan have?</h2>
        <p className="notes-count-subtitle">Select the total number of notes (including the ding)</p>

        <div className="notes-count-grid">
          {NOTE_COUNTS.map(count => (
            <button
              key={count}
              className="notes-count-btn"
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

export default NotesCountSelectionPage;
