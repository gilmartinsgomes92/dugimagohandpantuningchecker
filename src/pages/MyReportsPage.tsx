import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { listInstrumentHistory, moveCertifiedReportToInstrument, renameInstrument } from '../utils/userHistory';

type InstrumentHistory = Awaited<ReturnType<typeof listInstrumentHistory>> extends { instruments?: infer T } ? T : never;

const MyReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string>('');
  const [instruments, setInstruments] = useState<InstrumentHistory>([] as InstrumentHistory);
  const [editingInstrumentId, setEditingInstrumentId] = useState<string | null>(null);
  const [draftInstrumentName, setDraftInstrumentName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [reportMoveTargets, setReportMoveTargets] = useState<Record<string, string>>({});
  const [movingReportId, setMovingReportId] = useState<string | null>(null);
  const [expandedMoveReportId, setExpandedMoveReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      queueMicrotask(() => {
        setCheckingSession(false);
        setLoading(false);
        setError('Supabase is not configured yet.');
      });
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
    queueMicrotask(() => {
      setLoading(true);
      setError('');
    });

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

  const reloadHistory = async (activeUser: User) => {
    const result = await listInstrumentHistory(activeUser);
    if (!result.ok) {
      setError(result.error ?? 'Could not load your saved history.');
      return false;
    }

    setInstruments(result.instruments ?? ([] as InstrumentHistory));
    return true;
  };

  const handleStartRename = (instrumentId: string, currentName: string) => {
    setEditingInstrumentId(instrumentId);
    setDraftInstrumentName(currentName);
    setError('');
    setInfoMessage('');
  };

  const handleSaveRename = async (instrumentId: string) => {
    if (!user) return;

    setRenaming(true);
    setError('');
    setInfoMessage('');

    const result = await renameInstrument({
      user,
      instrumentId,
      name: draftInstrumentName,
    });

    if (!result.ok) {
      setError(result.error ?? 'Could not rename instrument.');
      setRenaming(false);
      return;
    }

    setInstruments((prev) =>
      prev.map((instrument) =>
        instrument.id === instrumentId
          ? {
              ...instrument,
              name: draftInstrumentName.trim(),
            }
          : instrument,
      ) as InstrumentHistory,
    );

    setEditingInstrumentId(null);
    setDraftInstrumentName('');
    setRenaming(false);
    setInfoMessage('Instrument name updated.');
  };

  const handleCancelRename = () => {
    setEditingInstrumentId(null);
    setDraftInstrumentName('');
  };

  const handleOpenMove = (reportId: string, currentInstrumentId: string) => {
    setReportMoveTargets((prev) => ({
      ...prev,
      [reportId]: prev[reportId] ?? currentInstrumentId,
    }));
    setExpandedMoveReportId(reportId);
    setError('');
    setInfoMessage('');
  };

  const handleCancelMove = () => {
    setExpandedMoveReportId(null);
  };

  const handleMoveReport = async (verificationId: string, currentInstrumentId: string, reportId: string) => {
    if (!user) return;

    const targetInstrumentId = reportMoveTargets[reportId] ?? currentInstrumentId;
    if (!targetInstrumentId || targetInstrumentId === currentInstrumentId) {
      return;
    }

    setMovingReportId(reportId);
    setError('');
    setInfoMessage('');

    const result = await moveCertifiedReportToInstrument({
      user,
      verificationId,
      instrumentId: targetInstrumentId,
    });

    if (!result.ok) {
      setError(result.error ?? 'Could not move this report.');
      setMovingReportId(null);
      return;
    }

    await reloadHistory(user);
    setReportMoveTargets((prev) => ({
      ...prev,
      [reportId]: result.instrumentId ?? targetInstrumentId,
    }));
    setMovingReportId(null);
    setExpandedMoveReportId(null);
    setInfoMessage(`Report moved to ${result.instrumentName ?? 'the selected instrument'}.`);
  };

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
        <strong>History tip:</strong> The first time an instrument is saved, we suggest a name from the detected scale, such as <em>G Pygmy</em>. Later you can rename instruments and move reports between them.
      </div>

      {infoMessage ? (
        <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1rem' }}>
          {infoMessage}
        </div>
      ) : null}

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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  {editingInstrumentId === instrument.id ? (
                    <>
                      <input
                        type="text"
                        value={draftInstrumentName}
                        onChange={(e) => setDraftInstrumentName(e.target.value)}
                        placeholder="Instrument name"
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid #2f2f2f',
                          background: '#181818',
                          color: '#fff',
                          fontSize: '1rem',
                          fontWeight: 700,
                          marginBottom: '0.5rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <p className="legal-meta">
                        {instrument.scale_label ? `Suggested scale: ${instrument.scale_label}` : 'Custom instrument label'}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 style={{ marginBottom: '0.4rem' }}>{instrument.name}</h3>
                      <p className="legal-meta">
                        {instrument.scale_label ? `Suggested scale: ${instrument.scale_label}` : 'Custom instrument label'}
                      </p>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {editingInstrumentId === instrument.id ? (
                    <>
                      <button type="button" className="btn btn-primary cert-inline-btn" onClick={() => handleSaveRename(instrument.id)} disabled={renaming}>
                        {renaming ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="btn btn-ghost cert-inline-btn" onClick={handleCancelRename} disabled={renaming}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost cert-inline-btn" onClick={() => handleStartRename(instrument.id, instrument.name)}>
                      Rename
                    </button>
                  )}
                </div>
              </div>

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
                    {instrument.reports.length > 0 ? instrument.reports.map((report) => {
                      const targetInstrumentId = reportMoveTargets[report.id] ?? report.instrument_id;
                      const moveExpanded = expandedMoveReportId === report.id;
                      const canMoveAnywhere = instruments.length > 1;

                      return (
                        <React.Fragment key={report.id}>
                          <tr>
                            <td>{new Date(report.report_created_at).toLocaleString()}</td>
                            <td>{report.verification_id}</td>
                            <td>{report.detected_scale ?? '—'}</td>
                            <td>{report.health_score ?? '—'}%</td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <Link className="btn btn-ghost cert-inline-btn" to={`/verify?id=${encodeURIComponent(report.verification_id)}`}>
                                  Open
                                </Link>
                                {canMoveAnywhere ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost cert-inline-btn"
                                    onClick={() => (moveExpanded ? handleCancelMove() : handleOpenMove(report.id, report.instrument_id))}
                                  >
                                    {moveExpanded ? 'Close' : 'Move'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {moveExpanded ? (
                            <tr>
                              <td colSpan={5} style={{ paddingTop: 0 }}>
                                <div
                                  className="cert-start-card cert-start-card-muted"
                                  style={{
                                    marginTop: '0.75rem',
                                    padding: '0.9rem 1rem',
                                    borderRadius: '12px',
                                  }}
                                >
                                  <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Move report to another instrument</div>
                                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <select
                                      value={targetInstrumentId}
                                      onChange={(e) => setReportMoveTargets((prev) => ({ ...prev, [report.id]: e.target.value }))}
                                      style={{
                                        flex: '1 1 220px',
                                        minWidth: '180px',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #2f2f2f',
                                        background: '#181818',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                      }}
                                    >
                                      {instruments.map((targetInstrument) => (
                                        <option key={targetInstrument.id} value={targetInstrument.id}>
                                          {targetInstrument.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="btn btn-primary cert-inline-btn"
                                      onClick={() => handleMoveReport(report.verification_id, report.instrument_id, report.id)}
                                      disabled={movingReportId === report.id || targetInstrumentId === report.instrument_id}
                                    >
                                      {movingReportId === report.id ? 'Moving…' : 'Confirm move'}
                                    </button>
                                    <button type="button" className="btn btn-ghost cert-inline-btn" onClick={handleCancelMove} disabled={movingReportId === report.id}>
                                      Cancel
                                    </button>
                                  </div>
                                  <div className="legal-meta" style={{ marginTop: '0.65rem' }}>
                                    Move stays hidden until you need it, so the history page remains easier to scan.
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="legal-meta">
                          No reports are currently assigned to this instrument.
                        </td>
                      </tr>
                    )}
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
