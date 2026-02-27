import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/WelcomePage.css';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleStartEvaluation = () => {
    navigate('/scale-selection');
  };

  const handleLogin = () => {
    console.log('Login clicked');
  };

  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <div className="header-container">
          <h1 className="app-title">🥁 Dugimago - Handpan Tuning Checker</h1>
          <p className="app-subtitle">Professional Tuning Evaluation Tool</p>
          <button className="btn-login" onClick={handleLogin}>
            Log In / Sign Up
          </button>
        </div>
      </header>

      <main className="welcome-main">
        <section className="intro-section">
          <h2>Welcome to Your Handpan Evaluation</h2>
          <p>
            Get a professional assessment of your handpan's tuning status. Our advanced
            audio analysis tool guides you through a complete evaluation routine and provides
            detailed feedback on your instrument's tuning.
          </p>
        </section>

        <section className="features-section">
          <div className="features-grid">
            <div className="feature-card">
              <span className="feature-icon">🎵</span>
              <h3>Note-by-Note Analysis</h3>
              <p>Real-time frequency detection for each note</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">📊</span>
              <h3>Detailed Results</h3>
              <p>Get comprehensive tuning reports</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">🔧</span>
              <h3>Professional Help</h3>
              <p>Connect with our tuning experts</p>
            </div>
            <div className="feature-card">
              <span className="feature-icon">💾</span>
              <h3>Save & Track</h3>
              <p>Premium: Keep history and compare over time</p>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <h2>Ready to Evaluate Your Handpan?</h2>
          <p>Start your tuning evaluation now. It takes just a few minutes.</p>
          <button className="btn-primary btn-large" onClick={handleStartEvaluation}>
            Start Tuning Evaluation
          </button>
          <p className="cta-subtext">
            No account required to get started.
          </p>
        </section>

        <section className="info-section">
          <h3>How It Works</h3>
          <ol className="steps-list">
            <li><strong>Identify Your Scale:</strong> Tell us your handpan's scale</li>
            <li><strong>Play Each Note:</strong> We'll guide you through each note</li>
            <li><strong>Get Results:</strong> Receive instant feedback on tuning status</li>
            <li><strong>Take Action:</strong> Contact us for professional tuning if needed</li>
          </ol>
        </section>
      </main>

      <footer className="welcome-footer">
        <p>&copy; 2024 Dugimago - Handpan Tuning Checker. All rights reserved.</p>
        <div className="footer-links">
          <a href="#about">About</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact Us</a>
        </div>
      </footer>
    </div>
  );
};

export default WelcomePage;