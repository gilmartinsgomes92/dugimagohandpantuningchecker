import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import dugimagoLogo from '../assets/dugimago-logo-cropped.png';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleCertifiedReportClick = async () => {
    if (!supabase) {
      navigate('/login');
      return;
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      navigate('/login');
      return;
    }

    navigate('/certification/start');
  };

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

          <button
            className="btn btn-premium btn-large"
            onClick={handleCertifiedReportClick}
          >
            Certified Tuning Report
          </button>

          <button
            className="btn btn-premium btn-large"
            onClick={() => navigate('/verify')}
          >
            Verify Report ID
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
