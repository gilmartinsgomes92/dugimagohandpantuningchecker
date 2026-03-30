import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type AuthMode = 'password-signin' | 'password-signup';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('password-signin');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setCheckingSession(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!isMounted) return;
      if (!error) setUser(data.user ?? null);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
    } catch {
      setStatus('error');
      setMessage('Something went wrong signing out.');
    }
  };

  const title = mode === 'password-signup' ? 'Create account' : 'Login';

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
