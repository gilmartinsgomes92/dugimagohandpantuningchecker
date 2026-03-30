import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

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

    try {
      setStatus('loading');
      setMessage('');

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      setStatus('success');
      setMessage('Magic link sent. Check your email.');
    } catch {
      setStatus('error');
      setMessage('Something went wrong sending the magic link.');
    }
  };

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
        <h1 style={{ margin: '0 0 8px', fontSize: '28px' }}>Login</h1>
        <p style={{ margin: '0 0 24px', color: '#5b6470', lineHeight: 1.5 }}>
          Enter your email and we’ll send you a magic link to sign in.
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
            {status === 'loading' ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

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
