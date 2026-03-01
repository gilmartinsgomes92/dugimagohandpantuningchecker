/**
 * TunerPage – standalone tuner page embedding the TunerInterface component.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TunerInterface } from '../components/TunerInterface';

const TunerPage: React.FC = () => {
  const navigate = useNavigate();
  const [handpanName, setHandpanName] = useState('My Handpan');

  return (
    <div className="page tuner-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="tuner-page-name-row">
          <label htmlFor="handpan-name" className="tuner-page-name-label">
            Instrument name:
          </label>
          <input
            id="handpan-name"
            className="tuner-page-name-input"
            type="text"
            value={handpanName}
            onChange={e => setHandpanName(e.target.value)}
            placeholder="e.g. Kurd D3"
          />
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/history')}>
          📋 History
        </button>
      </div>

      <TunerInterface handpanName={handpanName} />
    </div>
  );
};

export default TunerPage;
