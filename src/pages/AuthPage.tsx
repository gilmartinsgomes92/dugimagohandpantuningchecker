import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MIN_PASSWORD_LENGTH = 8;

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp, user, isConfigured, loading } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from || '/certification/start';
  }, [location.state]);

  React.useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [from, loading, navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setSubmitting(false);
      setError('Please enter your email.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmitting(false);
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (mode === 'login') {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate(from, { replace: true });
      }
    } else {
      const result = await signUp(email.trim(), password);
      if (result.error) {
        setError(result.error);
      } else if (result.needsEmailConfirmation) {
        setMessage('Account created. Please confirm your email, then sign in.');
        setMode('login');
      } else {
        setMessage('Account created and signed in.');
        navigate(from, { replace: true });
      }
    }

    setSubmitting(false);
  };

  return (
    <div className="page auth-page">
      <div className="page-header auth-page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="auth-card">
        <h2>{mode === 'login' ? 'Log in to continue' : 'Create your account'}</h2>
        <p className="auth-subtitle">
          Certification mode and saved report history can sit behind your account while Quick Tuning stays public.
        </p>

        {!isConfigured ? (
          <div className="auth-config-box">
            <strong>Supabase setup needed</strong>
            <p>
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your Vite env file, then redeploy.
            </p>
            <p className="auth-config-help">
              Use the included <code>.env.example</code> as the template.
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Minimum 8 characters"
              />
            </label>

            {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
            {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}

            <button className="btn btn-primary btn-large" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        )}

        <div className="auth-switch-row">
          <span>{mode === 'login' ? 'Need an account?' : 'Already have an account?'}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setMessage(null);
            }}
          >
            {mode === 'login' ? 'Create account' : 'Log in instead'}
          </button>
        </div>

        <div className="auth-helper-links">
          <Link to="/">Back to home</Link>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
