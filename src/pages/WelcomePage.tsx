import React from 'react';
import { useNavigate } from 'react-router-dom';
import dugimagoLogo from '../assets/dugimago-logo.png';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="page welcome-page">
      <div className="welcome-hero">
        <div className="welcome-logo">
          <img
            className="welcome-logo-img"
            src={dugimagoLogo}
            alt="Dugimago"
            loading="eager"
          />
        </div>

        <h1 className="welcome-title">Handpan Tuning Check</h1>
        <p className="welcome-subtitle">Precision Harmonic Analysis</p>

        <ul className="welcome-features">
          <li>✓ Real-time frequency detection</li>
          <li>✓ Guided note-by-note evaluation</li>
          <li>✓ Detailed tuning analysis</li>
        </ul>

        <div className="welcome-cta-group">
          <button
            className="btn btn-primary btn-large"
            onClick={() => navigate('/notes-count-selection')}
          >
            Start Check
          </button>

          <button
            className="btn btn-secondary btn-large"
            onClick={() => navigate('/scale-identify')}
          >
            Identify My Scale
          </button>

          <button className="btn btn-secondary btn-large" disabled>
            Comprehensive Tuning Check
            <span className="btn-coming-soon">Coming soon</span>
          </button>
        </div>
      </div>

      <footer className="welcome-footer">
        <div className="footer-features">
          <span>Harmonic-aware</span>
          <span>•</span>
          <span>Mobile-friendly</span>
          <span>•</span>
          <span>Fast tuning check</span>
        </div>
        <p className="footer-copyright">© {new Date().getFullYear()} Dugimago</p>
      </footer>
    </div>
  );
};

export default WelcomePage;
