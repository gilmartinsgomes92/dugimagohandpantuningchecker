import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type AuthMode = 'password-signin' | 'password-signup';

export default function LoginPage() {
  const authEnabled = isSupabaseConfigured() && !!supabase;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('password-signin');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(authEnabled);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!authEnabled || !supabase) {
      return;
    }

    const authClient = supabase;
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await authClient.auth.getUser();
      if (!isMounted) return;

      if (!error) {
        setUser(data.user ?? null);
      }

      setCheckingSession(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((event, session) => {
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
  }, [authEnabled]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!authEnabled || !supabase) {
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
    if (!authEnabled || !supabase) {
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
            <form onSubmit={handleUpdatePassword} style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d3d7de' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat your password"
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d3d7de' }}
                />
              </label>

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  marginTop: '8px',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: '#2754ff',
                  cursor: 'pointer',
                }}
              >
                {status === 'loading' ? 'Saving...' : 'Update password'}
              </button>
            </form>
          </>
        ) : user ? (
          <>
            <p style={{ margin: '0 0 20px', color: '#5b6470', lineHeight: 1.5 }}>
              Signed in as <strong>{user.email}</strong>
            </p>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={status === 'loading'}
              style={{
                border: 'none',
                borderRadius: '10px',
                padding: '12px 16px',
                fontWeight: 600,
                color: '#ffffff',
                background: '#1f2937',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {status === 'loading' ? 'Signing out...' : 'Sign out'}
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
              Use your email and password to access saved certified reports.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d3d7de' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete={mode === 'password-signup' ? 'new-password' : 'current-password'}
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #d3d7de' }}
                />
              </label>

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  marginTop: '8px',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: '#2754ff',
                  cursor: 'pointer',
                }}
              >
                {status === 'loading'
                  ? mode === 'password-signup'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'password-signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMode((prev) => (prev === 'password-signin' ? 'password-signup' : 'password-signin'))}
                style={{ background: 'none', border: 'none', padding: 0, color: '#2754ff', cursor: 'pointer' }}
              >
                {mode === 'password-signin' ? 'Create a new account' : 'I already have an account'}
              </button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={status === 'loading'}
                style={{ background: 'none', border: 'none', padding: 0, color: '#2754ff', cursor: 'pointer' }}
              >
                Forgot password?
              </button>
            </div>
          </>
        )}

        {message ? (
          <div
            style={{
              marginTop: '18px',
              borderRadius: '10px',
              padding: '12px 14px',
              background: status === 'error' ? '#fff1f1' : '#eef4ff',
              color: status === 'error' ? '#9f1d1d' : '#1d3f91',
              lineHeight: 1.5,
            }}
          >
            {message}
          </div>
        ) : null}

        <div style={{ marginTop: '20px' }}>
          <Link to="/" style={{ color: '#5b6470', textDecoration: 'none' }}>
            ← Back to tuner
          </Link>
        </div>
      </div>
    </div>
  );
}
