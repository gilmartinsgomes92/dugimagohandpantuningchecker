import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { useCertificationContext } from '../contexts/CertificationContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getAccountProfile, getBillingAccessStatus, wixBillingLinks } from '../utils/accountProfile';

const NOTE_COUNTS = Array.from({ length: 24 }, (_, index) => index + 7);

const CertificationStartPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useCertificationContext();
  const authEnabled = isSupabaseConfigured() && Boolean(supabase);
  const [user, setUser] = useState<User | null>(null);
  const [billingLoading, setBillingLoading] = useState(authEnabled);
  const [canStart, setCanStart] = useState(!authEnabled);
  const [billingMessage, setBillingMessage] = useState(
    authEnabled
      ? 'Sign in to prepare certified report access.'
      : 'Certified reports are open because account billing is not configured in this environment.',
  );

  useEffect(() => {
    if (!authEnabled || !supabase) {
      return;
    }

    const supabaseClient = supabase;
    let active = true;

    const load = async () => {
      setBillingLoading(true);

      const { data, error } = await supabaseClient.auth.getUser();
      if (!active) return;

      if (error || !data.user) {
        setUser(null);
        setCanStart(false);
        setBillingLoading(false);
        setBillingMessage('Sign in to prepare certified report access.');
        return;
      }

      setUser(data.user);
      const profileResult = await getAccountProfile(data.user);
      if (!active) return;

      if (!profileResult.ok) {
        setCanStart(true);
        setBillingLoading(false);
        setBillingMessage('Could not load billing status, but certified reports remain available during launch mode.');
        return;
      }

      const access = getBillingAccessStatus(profileResult.profile);
      setCanStart(access.canCreateCertifiedReports);
      setBillingLoading(false);

      if (!access.requiresEntitlement) {
        setBillingMessage('Launch mode is active. Certified reports are still available even before paid plans and credit packs go live.');
      } else if (access.hasActivePlan) {
        setBillingMessage('Your plan includes certified report access.');
      } else if (access.hasReportCredits) {
        setBillingMessage(`You have ${profileResult.profile.reportCredits} certified report credit${profileResult.profile.reportCredits === 1 ? '' : 's'} available.`);
      } else {
        setBillingMessage('This account is ready for paid certified reports, but you need a plan or report credits before starting.');
      }
    };

    void load();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [authEnabled]);

  const startSession = (notesCount: number) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!canStart) {
      return;
    }

    dispatch({ type: 'START_CERTIFICATION_SESSION', payload: { notesCount } });
    navigate('/certification/check');
  };

  return (
    <div className="page notes-count-page certification-start-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="notes-count-content">
        <h2 className="notes-count-title">Certified Tuning Report</h2>
        <p className="notes-count-subtitle">
          Three strikes per note. Median-based aggregation. Clear statuses for Measured, Not expected, and Inconclusive.
        </p>

        <div className="cert-start-card">
          <h3>Why this mode is more trustworthy</h3>
          <ul className="cert-bullet-list">
            <li>Uses 3 strikes per note instead of a single reading.</li>
            <li>Outvotes weak frames and occasional blank partials.</li>
            <li>Makes it easier to verify tuning in second-hand and remote sales.</li>
          </ul>
        </div>

        <div className="cert-start-card cert-start-card-muted" style={{ textAlign: 'left' }}>
          <strong>Access status:</strong>{' '}
          {billingLoading ? 'Checking your account…' : billingMessage}
          {!user ? (
            <>
              <br />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/login')}>
                Sign in to continue
              </button>
            </>
          ) : null}
          {user && !canStart && (wixBillingLinks.buyCredits || wixBillingLinks.playerPlan || wixBillingLinks.makerPlan) ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              {wixBillingLinks.buyCredits ? (
                <a className="btn btn-primary" href={wixBillingLinks.buyCredits} target="_blank" rel="noreferrer">
                  Buy credits
                </a>
              ) : null}
              {wixBillingLinks.playerPlan ? (
                <a className="btn btn-secondary" href={wixBillingLinks.playerPlan} target="_blank" rel="noreferrer">
                  Player plan
                </a>
              ) : null}
              {wixBillingLinks.makerPlan ? (
                <a className="btn btn-premium" href={wixBillingLinks.makerPlan} target="_blank" rel="noreferrer">
                  Maker plan
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="notes-count-grid">
          {NOTE_COUNTS.map((count) => (
            <button
              key={count}
              className="notes-count-btn"
              onClick={() => startSession(count)}
              disabled={billingLoading || !user || !canStart}
            >
              {count}
            </button>
          ))}
        </div>

        <div className="cert-start-card cert-start-card-muted">
          <strong>Default expectation:</strong> octave and compound fifth are expected.
          <br />
          You can mark a note as octave-only later if that tonefield is intentionally built without a compound fifth.
        </div>
      </div>
    </div>
  );
};

export default CertificationStartPage;
