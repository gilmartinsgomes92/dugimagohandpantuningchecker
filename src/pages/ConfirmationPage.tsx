import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

const ConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useAppContext();

  const handleStartOver = () => {
    dispatch({ type: 'RESET_EVALUATION' });
    navigate('/');
  };

  return (
    <div className="page confirmation-page">
      <div className="confirmation-content">
        <div className="confirmation-icon">🎵</div>
        <h2 className="confirmation-title">Thank You!</h2>
        <p className="confirmation-message">
          Your tuning evaluation has been submitted. Our experts will review your results and
          contact you shortly with personalized recommendations.
        </p>
        <div className="confirmation-actions">
          <button className="btn btn-primary" onClick={handleStartOver}>
            Evaluate Another Handpan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationPage;
