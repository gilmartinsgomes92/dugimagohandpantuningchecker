import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
            className="btn btn-primary btn-large welcome-action-card"
            onClick={() => navigate('/notes-count-selection')}
          >
            <span className="welcome-action-title">Quick Tuning Check</span>
            <span className="welcome-action-subtitle">Fast live tuning check</span>
          </button>
          <button
            className="btn btn-secondary btn-large welcome-action-card"
            onClick={() => navigate('/scale-identify')}
          >
            <span className="welcome-action-title">Identify My Scale</span>
            <span className="welcome-action-subtitle">Find your handpan scale family</span>
          </button>

          <button
            className="btn btn-premium btn-large welcome-action-card"
            onClick={() => navigate('/certification/start')}
          >
            <span className="welcome-action-title">Certified Tuning Report</span>
            <span className="welcome-action-subtitle">Formal report for buying, selling, and tuning verification</span>
          </button>

          <button
            className="btn btn-premium btn-large welcome-action-card"
            onClick={() => navigate('/verify')}
          >
            <span className="welcome-action-title">Verify Report ID</span>
            <span className="welcome-action-subtitle">Check a report’s authenticity</span>
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

        <div className="footer-links" aria-label="Legal and help links">
          <Link className="footer-link" to="/privacy">Privacy</Link>
          <Link className="footer-link" to="/terms">Terms</Link>
          <Link className="footer-link" to="/disclaimer">Disclaimer</Link>
          <Link className="footer-link" to="/faq">Q&amp;A</Link>
        </div>

        <p className="footer-copyright">© {new Date().getFullYear()} Dugimago</p>
      </footer>
    </div>
  );
};

export default WelcomePage;
