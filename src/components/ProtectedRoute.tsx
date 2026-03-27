import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page auth-page">
        <div className="auth-card auth-card-compact">
          <h2>Checking your session…</h2>
          <p>Please wait.</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return <Navigate to="/auth" replace state={{ from: location.pathname, reason: 'config' }} />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
