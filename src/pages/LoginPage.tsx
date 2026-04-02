import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ensureUserProfile,
  formatPlanName,
  getAccountProfile,
  getBillingAccessStatus,
  updateMarketingPreference,
  wixBillingLinks,
  type AccountProfile,
} from '../utils/accountProfile';

type AuthMode = 'password-signin' | 'password-signup';

const inputStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #d3d7de',
};

const primaryButtonStyle: CSSProperties = {
  marginTop: '8px',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 16px',
  fontWeight: 600,
  color: '#ffffff',
  background: '#2754ff',
  cursor: 'pointer',
};

export default function LoginPage() {
  const authEnabled = isSupabaseConfigured() && !!supabase;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [marketingSignupOptIn, setMarketingSignupOptIn] = useState(false);
  const [mode, setMode] = useState<AuthMode>('password-signin');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(authEnabled);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [preferencesStatus, setPreferencesStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [preferencesMessage, setPreferencesMessage] = useState('');
  const [marketingPreference, setMarketingPreference] = useState(false);

  const billingStatus = getBillingAccessStatus(accountProfile);

  const loadProfile = useCallback(async (nextUser: User | null, options?: { marketingOptIn?: boolean; marketingOptInSource?: string }) => {
    if (!nextUser || !authEnabled) {
      setAccountProfile(null);
      setMarketingPreference(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    const ensured = await ensureUserProfile(nextUser, options);
    if (!ensured.ok) {
      setAccountProfile(null);
      setMarketingPreference(false);
      setProfileLoading(false);
      return;
    }

    const profileResult = await getAccountProfile(nextUser);
    if (!profileResult.ok) {
      setAccountProfile(ensured.profile ?? null);
      setMarketingPreference(Boolean(ensured.profile?.marketingOptIn));
      setProfileLoading(false);
      return;
    }

    setAccountProfile(profileResult.profile);
    setMarketingPreference(Boolean(profileResult.profile.marketingOptIn));
    setProfileLoading(false);
  }, [authEnabled]);

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
        const nextUser = data.user ?? null;
        setUser(nextUser);
        if (nextUser) {
          await loadProfile(nextUser);
        }
      }

      setCheckingSession(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        void loadProfile(nextUser);
      } else {
        setAccountProfile(null);
        setMarketingPreference(false);
      }

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
  }, [authEnabled, loadProfile]);

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

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: 'https://tuner.dugimago.com/login',
          data: {
            marketing_opt_in: marketingSignupOptIn,
          },
        },
      });

      if (error) {
        setStatus('error');
        setMessage(error.message);
        return;
      }

      if (data.user) {
        await loadProfile(data.user, {
          marketingOptIn: marketingSignupOptIn,
          marketingOptInSource: 'app_signup',
        });
      }

      setStatus('success');
      setMessage(
        marketingSignupOptIn
          ? 'Account created. Check your email to confirm your account. You are also marked to receive Dugimago updates and occasional offers.'
          : 'Account created. Check your email to confirm your account.',
      );
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

  const handleSavePreferences = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      setPreferencesStatus('error');
      setPreferencesMessage('Sign in to update your email preferences.');
      return;
    }

    setPreferencesStatus('loading');
    setPreferencesMessage('Saving your email preferences…');

    const profileResult = await updateMarketingPreference(user, marketingPreference);
    if (!profileResult.ok) {
      setPreferencesStatus('error');
      setPreferencesMessage(profileResult.error ?? 'Could not update your email preferences.');
      return;
    }

    setAccountProfile(profileResult.profile);
    setMarketingPreference(profileResult.profile.marketingOptIn);
    setPreferencesStatus('success');
    setPreferencesMessage(
      profileResult.profile.marketingOptIn
        ? 'You are opted in to receive Dugimago updates and occasional offers.'
        : 'You are opted out of marketing emails.',
    );
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
      setAccountProfile(null);
      setPassword('');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setPreferencesStatus('idle');
      setPreferencesMessage('');
      setMarketingPreference(false);
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
          maxWidth: '520px',
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
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat your password"
                  style={inputStyle}
                />
              </label>

              <button
                type="submit"
                disabled={status === 'loading'}
                style={primaryButtonStyle}
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

            <div
              style={{
                borderRadius: '14px',
                padding: '16px',
                border: '1px solid #e4e7ec',
                background: '#f8fbff',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>Billing status</div>
              {profileLoading ? (
                <div style={{ color: '#5b6470', lineHeight: 1.5 }}>Loading account profile…</div>
              ) : (
                <>
                  <div style={{ color: '#1f2937', lineHeight: 1.6 }}>
                    <strong>Plan:</strong> {formatPlanName(accountProfile?.planSlug)}
                    <br />
                    <strong>Report credits:</strong> {accountProfile?.reportCredits ?? 0}
                    <br />
                    <strong>Certified report access:</strong>{' '}
                    {billingStatus.canCreateCertifiedReports ? 'Available' : 'Locked until a plan or credits are added'}
                  </div>

                  <div style={{ marginTop: '12px', color: '#5b6470', lineHeight: 1.5, fontSize: '14px' }}>
                    {billingStatus.requiresEntitlement
                      ? 'This account structure is ready for Wix-linked plans and credit packs. When billing is enabled, certified reports can be controlled here.'
                      : 'Certified reports are still open during launch mode. Credits and recurring plans can be switched on later without changing the account structure.'}
                  </div>

                  {(wixBillingLinks.buyCredits || wixBillingLinks.playerPlan || wixBillingLinks.makerPlan) ? (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                      {wixBillingLinks.buyCredits ? (
                        <a href={wixBillingLinks.buyCredits} target="_blank" rel="noreferrer" style={{ ...primaryButtonStyle, marginTop: 0, textDecoration: 'none', display: 'inline-flex' }}>
                          Buy report credits
                        </a>
                      ) : null}
                      {wixBillingLinks.playerPlan ? (
                        <a href={wixBillingLinks.playerPlan} target="_blank" rel="noreferrer" style={{ ...primaryButtonStyle, marginTop: 0, textDecoration: 'none', display: 'inline-flex', background: '#1f2937' }}>
                          Player plan
                        </a>
                      ) : null}
                      {wixBillingLinks.makerPlan ? (
                        <a href={wixBillingLinks.makerPlan} target="_blank" rel="noreferrer" style={{ ...primaryButtonStyle, marginTop: 0, textDecoration: 'none', display: 'inline-flex', background: '#0f766e' }}>
                          Maker plan
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: '12px', color: '#5b6470', lineHeight: 1.5, fontSize: '14px' }}>
                      Add `VITE_WIX_BUY_CREDITS_URL`, `VITE_WIX_PLAYER_PLAN_URL`, and `VITE_WIX_MAKER_PLAN_URL` to expose live purchase buttons here.
                    </div>
                  )}
                </>
              )}
            </div>

            <form
              onSubmit={handleSavePreferences}
              style={{
                display: 'grid',
                gap: '12px',
                borderRadius: '14px',
                padding: '16px',
                border: '1px solid #e4e7ec',
                background: '#ffffff',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>Email preferences</div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#1f2937', lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={marketingPreference}
                  onChange={(e) => setMarketingPreference(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>I want to receive Dugimago news, feature updates, and occasional offers by email.</span>
              </label>
              <div style={{ color: '#5b6470', fontSize: '14px', lineHeight: 1.5 }}>
                This prepares the app for a Wix-connected updates list while keeping consent explicit and reversible.
              </div>
              <button type="submit" disabled={preferencesStatus === 'loading'} style={primaryButtonStyle}>
                {preferencesStatus === 'loading' ? 'Saving preferences...' : 'Save email preferences'}
              </button>
              {preferencesMessage ? (
                <div
                  style={{
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: preferencesStatus === 'error' ? '#fff1f1' : '#eef4ff',
                    color: preferencesStatus === 'error' ? '#9f1d1d' : '#1d3f91',
                    lineHeight: 1.5,
                  }}
                >
                  {preferencesMessage}
                </div>
              ) : null}
            </form>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={status === 'loading'}
              style={{
                ...primaryButtonStyle,
                width: '100%',
                background: '#1f2937',
                marginTop: '16px',
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
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </label>

              {mode === 'password-signup' ? (
                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: '#1f2937', lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={marketingSignupOptIn}
                    onChange={(e) => setMarketingSignupOptIn(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span>I want to receive Dugimago news, feature updates, and occasional offers by email.</span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={status === 'loading'}
                style={primaryButtonStyle}
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
