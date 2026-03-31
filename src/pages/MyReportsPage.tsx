import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { listInstrumentHistory } from '../utils/userHistory';

type InstrumentHistory = Awaited<ReturnType<typeof listInstrumentHistory>> extends { instruments?: infer T } ? T : never;

const MyReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [instruments, setInstruments] = useState<InstrumentHistory>([] as InstrumentHistory);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setCheckingSession(false);
      setLoading(false);
      setError('Supabase is not configured yet.');
      return;
    }

    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) {
        navigate('/login');
        return;
      }
      setUser(data.user);
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    listInstrumentHistory(user).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error ?? 'Could not load your saved history.');
        setLoading(false);
        return;
      }

      setInstruments(result.instruments ?? ([] as InstrumentHistory));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (checkingSession) {
    return (
      <div className="page results-page">
        <div className="cert-start-card cert-start-card-muted">Checking account…</div>
      </div>
    );
  }

  return (
    <div className="page results-page my-reports-page">
      <div className="page-header">
        <h1 className="scaleid-title">My Certified Reports</h1>
        <p className="scaleid-subtitle">
          Your certified reports are grouped by instrument. New certified reports are saved automatically when you are signed in.
        </p>
      </div>

      <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1rem' }}>
        <strong>History tip:</strong> The first time an instrument is saved, we suggest a name from the detected scale, such as <em>G Pygmy</em>. Later you can refine naming and organization.
      </div>

      {loading ? (
        <div className="cert-start-card cert-start-card-muted">Loading your report history…</div>
      ) : error ? (
        <div className="error-banner"><strong>History error:</strong> {error}</div>
      ) : instruments.length === 0 ? (
        <div className="cert-start-card cert-start-card-muted">
          You do not have any saved certified reports yet. Create a certified report while signed in and it will appear here automatically.
          <div className="page-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={() => navigate('/certification/start')}>Create Certified Report</button>
          </div>
        </div>
      ) : (
        <div className="legal-content">
          {instruments.map((instrument) => (
            <div key={instrument.id} className="legal-card">
              <h3 style={{ marginBottom: '0.4rem' }}>{instrument.name}</h3>
              <p className="legal-meta">
                {instrument.scale_label ? `Suggested scale: ${instrument.scale_label}` : 'Custom instrument label'}
              </p>

              <div className="results-table-container" style={{ marginTop: '1rem' }}>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Verification ID</th>
                      <th>Scale</th>
                      <th>Health</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instrument.reports.map((report) => (
                      <tr key={report.id}>
                        <td>{new Date(report.report_created_at).toLocaleString()}</td>
                        <td>{report.verification_id}</td>
                        <td>{report.detected_scale ?? '—'}</td>
                        <td>{report.health_score ?? '—'}%</td>
                        <td>
                          <Link
                            className="btn btn-ghost cert-inline-btn"
                            to={`/verify?id=${encodeURIComponent(report.verification_id)}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyReportsPage;
