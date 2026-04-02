import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCertificationContext } from '../contexts/CertificationContext';

const NOTE_COUNTS = Array.from({ length: 24 }, (_, index) => index + 7);


const CertificationStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useCertificationContext();

  const startSession = (notesCount: number) => {
    dispatch({ type: 'START_CERTIFICATION_SESSION', payload: { notesCount } });
    navigate('/certification/check');
  };

  return (
    <div className="page notes-count-page certification-start-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="notes-count-content">
        <h2 className="notes-count-title">Certified Tuning Report</h2>
        <p className="notes-count-subtitle">
          Three strikes per note. Median-based aggregation. Clear statuses for Measured, Not expected, and Inconclusive.
        </p>

        <div className="cert-start-card">
          <h3>Why this mode is more trustworthy</h3>
          <ul className="cert-bullet-list">
            <li>Uses 3 strikes per note instead of a single reading.</li>
            <li>Outvotes weak frames and occasional blank partials.</li>
            <li>Makes it easier to verify tuning in second-hand and remote sales.</li>
          </ul>
        </div>

        <div className="notes-count-grid">
          {NOTE_COUNTS.map((count) => (
            <button
              key={count}
              className="notes-count-btn"
              onClick={() => startSession(count)}
            >
              {count}
            </button>
          ))}
        </div>

        <div className="cert-start-card cert-start-card-muted">
          <strong>Default expectation:</strong> octave and compound fifth are expected.
          <br />
          You can mark a note as octave-only later if that tonefield is intentionally built without a compound fifth.
        </div>
      </div>
    </div>
  );
};

export default CertificationStartPage;
