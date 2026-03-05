import React from 'react';
import { useNavigate } from 'react-router-dom';
import dugimagoLogo from '../assets/dugimago-logo-cropped.png';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="page welcome-page">
      <div className="welcome-hero">
        <header className="welcome-header">
          <div className="welcome-brand">
            <div className="welcome-logo-wrap">
              <img className="welcome-logo-img" src={dugimagoLogo} alt="Dugimago" loading="eager" />
            </div>
            <div className="welcome-brand-name">Dugimago</div>
          </div>

          <h1 className="welcome-title">Handpan Tuning Check</h1>
          <p className="welcome-subtitle">
            Precision Harmonic Analysis
          </p>
        </header>

        <ul className="welcome-feature-list" aria-label="Key features">
          <li>
            <span className="welcome-check" aria-hidden="true">✓</span>
            Real-time frequency detection
          </li>
          <li>
            <span className="welcome-check" aria-hidden="true">✓</span>
            Guided note-by-note evaluation
          </li>
          <li>
            <span className="welcome-check" aria-hidden="true">✓</span>
            Detailed tuning analysis
          </li>
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

          <p className="welcome-privacy">
            Mic permission required. Audio stays on your device.
          </p>
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
