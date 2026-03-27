import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="page auth-page">
      <div className="page-header auth-page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="auth-card">
        <h2>My account</h2>
        <p className="auth-subtitle">This is the foundation for certification history, verification IDs, and saved reports.</p>

        <div className="account-summary">
          <div>
            <span className="account-label">Signed in as</span>
            <strong>{user?.email ?? 'Unknown user'}</strong>
          </div>
          <div>
            <span className="account-label">Next recommended step</span>
            <strong>Save certified reports to user history</strong>
          </div>
        </div>

        <div className="auth-actions-stack">
          <button className="btn btn-primary btn-large" onClick={() => navigate('/certification/start')}>
            Go to Certification Mode
          </button>
          <button
            className="btn btn-secondary btn-large"
            onClick={async () => {
              await signOut();
              navigate('/', { replace: true });
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
