import React from 'react';
import { useNavigate } from 'react-router-dom';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="page welcome-page">
      <div className="welcome-hero">
        <div className="welcome-logo">
          <span className="logo-icon">♪</span>
          <span className="logo-text">HandPan<span className="logo-accent">Pro</span></span>
        </div>
        <h1 className="welcome-title">Professional Handpan<br />Tuning Checker</h1>
        <p className="welcome-subtitle">Evaluate your instrument in seconds</p>

        <ul className="welcome-features">
          <li>✓ Real-time frequency detection with professional accuracy</li>
          <li>✓ Step-by-step note-by-note guided evaluation</li>
          <li>✓ Detailed results with cents deviation analysis</li>
        </ul>

        <div className="welcome-cta-group">
          <button
            className="btn btn-primary btn-large"
            onClick={() => navigate('/notes-count-selection')}
          >
            🎵 Quick Tuning Check
          </button>

          <button
            className="btn btn-secondary btn-large"
            disabled
          >
            🔒 Comprehensive Tuning Check
            <span className="btn-coming-soon">Coming Soon</span>
          </button>
        </div>

        <p className="welcome-login-link">
          Already a subscriber? <a href="#login" onClick={e => e.preventDefault()}>Log In</a>
        </p>
      </div>

      <footer className="welcome-footer">
        <div className="footer-features">
          <span>🎵 YIN Algorithm</span>
          <span>📊 Sub-cent accuracy</span>
          <span>📱 Mobile friendly</span>
        </div>
        <p className="footer-copyright">© 2025 HandPanPro · Professional Tuning Tools</p>
      </footer>
    </div>
  );
};

export default WelcomePage;
