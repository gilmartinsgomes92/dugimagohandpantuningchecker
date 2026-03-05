import React from 'react';
import { useNavigate } from 'react-router-dom';
import dugimagoLogo from '../assets/dugimago-logo.png';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="page welcome-page">
      <div className="welcome-hero">
        <header className="welcome-header">
          <div className="welcome-brand">
            <img
              className="welcome-logo-img"
              src={dugimagoLogo}
              alt="Dugimago"
              loading="eager"
            />
            <div className="welcome-brand-text">
              <div className="welcome-brand-name">Dugimago</div>
              <div className="welcome-brand-divider" />
              <div className="welcome-brand-tag">Handpan Tools</div>
            </div>
          </div>

          <h1 className="welcome-title">Handpan Tuning Check</h1>
          <p className="welcome-subtitle">
            Fast, reliable harmonic-aware feedback (fundamental + octave + fifth)
          </p>
        </header>

        <div className="welcome-chips" aria-label="Key features">
          <div className="welcome-chip">Live pitch detection</div>
          <div className="welcome-chip">Harmonic check (8ve + 5th)</div>
          <div className="welcome-chip">Guided note-by-note flow</div>
        </div>

        <div className="welcome-cta-group">
          <button
            className="btn btn-primary btn-large"
            onClick={() => navigate('/notes-count-selection')}
          >
            Start Check
          </button>
          <p className="welcome-helper">Takes ~2 minutes • Best in a quiet room</p>

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
