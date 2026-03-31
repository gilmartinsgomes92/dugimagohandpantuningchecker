import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import dugimagoLogo from '../assets/dugimago-logo-cropped.png';

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const iconWrapStyle: React.CSSProperties = {
  position: 'absolute',
  left: 'clamp(22px, 6vw, 34px)',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};

const textWrapStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
};

const buttonWithIconStyle: React.CSSProperties = {
  position: 'relative',
};

const SearchIcon = () => (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const MusicIcon = () => (
  <svg {...iconProps}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3l7 3v6c0 4.5-2.9 7.9-7 9-4.1-1.1-7-4.5-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

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
            style={buttonWithIconStyle}
            onClick={() => navigate('/scale-identify')}
          >
            <span style={iconWrapStyle} aria-hidden="true">
              <MusicIcon />
            </span>
            <span style={textWrapStyle}>Identify My Scale</span>
          </button>

          <button
            className="btn btn-premium btn-large"
            style={buttonWithIconStyle}
            onClick={handleCertifiedReportClick}
          >
            <span style={iconWrapStyle} aria-hidden="true">
              <ShieldCheckIcon />
            </span>
            <span style={textWrapStyle}>Certified Tuning Report</span>
          </button>

          <button
            className="btn btn-premium btn-large"
            style={buttonWithIconStyle}
            onClick={() => navigate('/verify')}
          >
            <span style={iconWrapStyle} aria-hidden="true">
              <SearchIcon />
            </span>
            <span style={textWrapStyle}>Verify Report ID</span>
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
