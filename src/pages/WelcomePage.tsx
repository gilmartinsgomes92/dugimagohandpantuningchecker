import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import dugimagoLogo from '../assets/dugimago-logo-cropped.png';

type WelcomeAction = {
  title: string;
  description: string;
  variant: 'primary' | 'secondary' | 'premium';
  onClick: () => void;
};

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  const actions: WelcomeAction[] = [
    {
      title: 'Quick Tuning Check',
      description: 'Fast live tuning check',
      variant: 'primary',
      onClick: () => navigate('/notes-count-selection'),
    },
    {
      title: 'Identify My Scale',
      description: 'Find your handpan scale family',
      variant: 'secondary',
      onClick: () => navigate('/scale-identify'),
    },
    {
      title: 'Certified Tuning Report',
      description: 'Formal report for buying, selling, and tuning verification',
      variant: 'premium',
      onClick: () => navigate('/certification/start'),
    },
    {
      title: 'Verify Report ID',
      description: "Check a report's authenticity",
      variant: 'premium',
      onClick: () => navigate('/verify'),
    },
  ];

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
          <p className="welcome-subtitle">Precision Harmonic Analysis</p>
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

        <div className="welcome-cta-group" aria-label="Main app actions">
          {actions.map((action) => (
            <div key={action.title} className="welcome-action-item">
              <button
                className={`btn btn-${action.variant} btn-large welcome-action-card`}
                onClick={action.onClick}
              >
                <span className="welcome-action-title">{action.title}</span>
              </button>
              <p className="welcome-action-description">{action.description}</p>
            </div>
          ))}

          <p className="welcome-privacy">Mic permission required. Audio stays on your device.</p>
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
