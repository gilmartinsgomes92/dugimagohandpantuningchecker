import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type AuthMode = 'password-signin' | 'password-signup';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('password-signin');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setCheckingSession(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!isMounted) return;

      if (!error) {
        setUser(data.user ?? null);
      }

      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setStatus('idle');
        setMessage('Choose a new password for your account.');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isSupabaseConfigured() || !supabase) {
      setStatus('error');
      setMessage('Supabase is not configured yet.');
      return;
    }

    if (!email.trim()) {
      setStatus('error');
      setMessage('Please enter your email.');
      return;
    }

    if (password.length < 6) {
      setStatus('error');
      setMessage('Password must have at least 6 characters.');
      return;
    }

    try {
      setStatus('loading');
      setMessage('');

      if (mode === 'password-signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setStatus('error');
          setMessage(error.message);
          return;
        }

        setStatus('success');
        setMessage('Signed in successfully.');
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: 'https://tuner.dugimago.com/login',
        },
      });

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('success');
      setMessage('Account created. Check your email to confirm your account.');
    } catch {
      setStatus('error');
      setMessage('Something went wrong.');
    }
  };

  const handleForgotPassword = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setStatus('error');
      setMessage('Supabase is not configured yet.');
      return;
    }

    if (!email.trim()) {
      setStatus('error');
      setMessage('Enter your email first, then click Forgot password.');
      return;
    }

    try {
      setStatus('loading');
      setMessage('');

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://tuner.dugimago.com/login',
      });

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('success');
      setMessage('Password reset email sent. Check your inbox.');
    } catch {
      setStatus('error');
      setMessage('Something went wrong sending the reset email.');
    }
  };

  const handleUpdatePassword = async (event: FormEvent) => {
    event.preventDefault();

    if (!supabase) return;

    if (newPassword.length < 6) {
      setStatus('error');
      setMessage('New password must have at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }

    try {
      setStatus('loading');
      setMessage('');

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('success');
      setMessage('Password updated successfully.');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setStatus('error');
      setMessage('Something went wrong updating your password.');
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;

    try {
      setStatus('loading');
      setMessage('');

      const { error } = await supabase.auth.signOut();

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('idle');
      setMessage('Signed out successfully.');
      setUser(null);
      setPassword('');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setStatus('error');
      setMessage('Something went wrong signing out.');
    }
  };

  const title = recoveryMode
    ? 'Set new password'
    : mode === 'password-signup'
    ? 'Create account'
    : 'Login';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        background: '#f7f8fb',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '28px' }}>{title}</h1>

        {checkingSession ? (
          <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
            Checking session...
          </p>
        ) : recoveryMode ? (
          <>
            <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
              Enter your new password below.
            </p>

            <form onSubmit={handleUpdatePassword}>
              <label
                htmlFor="new-password"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}
              >
                New password
              </label>

              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cfd6df',
                  fontSize: '16px',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                }}
              />

              <label
                htmlFor="confirm-new-password"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}
              >
                Confirm new password
              </label>

              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cfd6df',
                  fontSize: '16px',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: status === 'loading' ? 'default' : 'pointer',
                  opacity: status === 'loading' ? 0.7 : 1,
                }}
              >
                {status === 'loading' ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        ) : user ? (
          <>
            <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
              Signed in as <strong>{user.email}</strong>
            </p>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={status === 'loading'}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: status === 'loading' ? 'default' : 'pointer',
                opacity: status === 'loading' ? 0.7 : 1,
              }}
            >
              {status === 'loading' ? 'Signing out...' : 'Sign out'}
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode('password-signin');
                  setMessage('');
                  setStatus('idle');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: mode === 'password-signin' ? '2px solid #111827' : '1px solid #cfd6df',
                  background: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('password-signup');
                  setMessage('');
                  setStatus('idle');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: mode === 'password-signup' ? '2px solid #111827' : '1px solid #cfd6df',
                  background: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sign up
              </button>
            </div>

            <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
              {mode === 'password-signup'
                ? 'Create an account with your email and password.'
                : 'Sign in with your email and password.'}
            </p>

            <form onSubmit={handleSubmit}>
              <label
                htmlFor="email"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cfd6df',
                  fontSize: '16px',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                }}
              />

              <label
                htmlFor="password"
                style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete={mode === 'password-signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cfd6df',
                  fontSize: '16px',
                  marginBottom: '12px',
                  boxSizing: 'border-box',
                }}
              />

              {mode === 'password-signin' && (
                <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={status === 'loading'}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#1d4ed8',
                      fontSize: '14px',
                      cursor: status === 'loading' ? 'default' : 'pointer',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: status === 'loading' ? 'default' : 'pointer',
                  opacity: status === 'loading' ? 0.7 : 1,
                }}
              >
                {status === 'loading'
                  ? 'Please wait...'
                  : mode === 'password-signup'
                  ? 'Create account'
                  : 'Login'}
              </button>
            </form>
          </>
        )}

        {message ? (
          <p
            style={{
              marginTop: '16px',
              color: status === 'error' ? '#b42318' : '#1d4ed8',
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        ) : null}

        <p style={{ marginTop: '20px' }}>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
