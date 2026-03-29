import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

type LegalPageLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, subtitle, children }) => {
  const navigate = useNavigate();

  return (
    <div className="page legal-page">
      <div className="page-header legal-page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate(-1)}>← Back</button>
        <h2 className="page-title">{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      <div className="legal-nav-card">
        <div className="legal-nav-title">Related pages</div>
        <div className="legal-nav-grid">
          <Link className="legal-link-chip" to="/privacy">Privacy</Link>
          <Link className="legal-link-chip" to="/terms">Terms</Link>
          <Link className="legal-link-chip" to="/disclaimer">Disclaimer</Link>
          <Link className="legal-link-chip" to="/faq">Q&amp;A</Link>
        </div>
      </div>

      <div className="legal-content">{children}</div>
    </div>
  );
};

export default LegalPageLayout;
