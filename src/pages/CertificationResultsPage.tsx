import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCertificationAggregates, useCertificationContext } from '../contexts/CertificationContext';
import { formatCents } from '../utils/musicUtils';
import { statusText } from '../utils/certificationAggregation';
import {
  getCertificationNoteStatus,
  getCertificationReportStats,
  getCertificationStatusClassName,
  getCertificationStatusLabel,
  getCertificationVerdict,
} from '../utils/certificationReportUtils';
import CertificationShareCard from '../components/CertificationShareCard';
import { exportShareCard } from '../utils/exportShareCard';
import { createCertificationReportRecord, saveCertificationReport } from '../utils/reportRegistry';
import { certificationAggregateSortKey } from '../utils/certificationOrder';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { saveCertifiedReportToHistory } from '../utils/userHistory';

const CertificationResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useCertificationContext();
  const allAggregates = useCertificationAggregates();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [historySaveState, setHistorySaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'skipped'>('idle');
  const [historySaveMessage, setHistorySaveMessage] = useState<string>('');
  const lastSavedSignatureRef = useRef<string | null>(null);
  const lastHistorySavedSignatureRef = useRef<string | null>(null);

  const aggregates = useMemo(
    () => [...allAggregates]
      .filter((aggregate) => aggregate.strikeCount > 0)
      .sort((a, b) => {
        const keyDiff = certificationAggregateSortKey(a) - certificationAggregateSortKey(b);
        if (keyDiff !== 0) return keyDiff;
        return a.noteName.localeCompare(b.noteName);
      }),
    [allAggregates],
  );

  const stats = useMemo(() => getCertificationReportStats(aggregates), [aggregates]);
  const verdict = useMemo(() => getCertificationVerdict(stats), [stats]);
  const verificationId = state.verificationId ?? 'Pending';

  useEffect(() => {
    if (!state.notesCount) {
      navigate('/certification/start');
      return;
    }

    if (!state.finalizedAt || !state.verificationId) {
      navigate('/certification/review');
    }
  }, [navigate, state.finalizedAt, state.notesCount, state.verificationId]);

  const reportRecord = useMemo(() => {
    if (!verificationId || verificationId === 'Pending' || aggregates.length === 0) return null;
    return createCertificationReportRecord({
      verificationId,
      aggregates,
      stats,
      verdict,
    });
  }, [aggregates, stats, verificationId, verdict]);

  const reportSignature = useMemo(() => (reportRecord ? JSON.stringify(reportRecord) : null), [reportRecord]);

  useEffect(() => {
  if (!reportRecord || !reportSignature || lastSavedSignatureRef.current === reportSignature) {
    return;
  }

  let cancelled = false;

  setSaveState('saving');
  setSaveMessage('Saving original report to the verification registry…');

  saveCertificationReport(reportRecord).then((result) => {
    if (cancelled) return;

    if (result.ok) {
      lastSavedSignatureRef.current = reportSignature;
      setSaveState('saved');
      setSaveMessage('Original report saved. This verification ID can now be checked on the Verify page.');
    } else {
      setSaveState('error');
      setSaveMessage(result.error ?? 'Could not save this report to the verification registry.');
    }
  });

  return () => {
    cancelled = true;
  };
}, [reportRecord, reportSignature]);

  useEffect(() => {
    if (!reportRecord || !reportSignature || lastHistorySavedSignatureRef.current === reportSignature) {
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      setHistorySaveState('skipped');
      setHistorySaveMessage('Sign in and connect Supabase to save certified report history to your account.');
      return;
    }

    let cancelled = false;

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;

      if (error || !data.user) {
        setHistorySaveState('skipped');
        setHistorySaveMessage('Sign in to save this certified report to your personal history.');
        return;
      }

      setHistorySaveState('saving');
      setHistorySaveMessage('Saving this certified report to your account history…');

      const result = await saveCertifiedReportToHistory({
        user: data.user,
        verificationId,
        aggregates,
        stats,
        verdict,
        finalizedAt: state.finalizedAt ?? new Date().toISOString(),
      });

      if (cancelled) return;

      if (result.ok) {
        lastHistorySavedSignatureRef.current = reportSignature;
        setHistorySaveState('saved');
        setHistorySaveMessage(`Saved to your account history under ${result.instrumentName ?? 'this instrument'}.`);
      } else {
        setHistorySaveState('error');
        setHistorySaveMessage(result.error ?? 'Could not save this certified report to your account history.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [aggregates, reportRecord, reportSignature, state.finalizedAt, stats, verificationId, verdict]);

  const handleStartOver = () => {
    dispatch({ type: 'RESET_CERTIFICATION_SESSION' });
    navigate('/');
  };

  const shareCertifiedReport = async () => {
    const safeVerificationId = verificationId.replace(/[^A-Z0-9-]/gi, '-').toLowerCase();
    await exportShareCard('certification-share-card', `dugimago-certified-tuning-report-${safeVerificationId}.png`);
  };

  return (
    <div className="page results-page certification-results-page">
      <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1rem' }}>
        <strong>Verification ID:</strong> {verificationId}
        <br />
        Issued {state.finalizedAt ? new Date(state.finalizedAt).toLocaleString() : 'just now'}. This report is now locked and read-only. Keep this number with the certificate. It is the reference used to confirm the original report later.
      </div>

      <div
        className="cert-start-card cert-start-card-muted"
        style={{ marginBottom: '1rem', borderColor: saveState === 'error' ? 'rgba(255,102,102,0.45)' : undefined }}
      >
        <strong>Registry status:</strong> {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Pending'}
        <br />
        {saveMessage || 'The original certified report will be stored in the verification registry.'}
      </div>

      <div
        className="cert-start-card cert-start-card-muted"
        style={{ marginBottom: '1rem', borderColor: historySaveState === 'error' ? 'rgba(255,102,102,0.45)' : undefined }}
      >
        <strong>Account history:</strong> {historySaveState === 'saved' ? 'Saved' : historySaveState === 'saving' ? 'Saving…' : historySaveState === 'error' ? 'Save failed' : historySaveState === 'skipped' ? 'Sign in required' : 'Pending'}
        <br />
        {historySaveMessage || 'When you are signed in, this certified report is also saved automatically to your personal history.'}
      </div>

      <div className="results-verdict">
        <div className={`verdict-badge ${verdict.className}`}>{verdict.badge}</div>
        <h2 className="verdict-title">{verdict.label}</h2>
        <p className="verdict-subtitle">{verdict.subtitle}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: verdict.className === 'verdict-good' ? '#00ff88' : verdict.className === 'verdict-bad' ? '#ff6666' : '#ffaa00' }}>
            {stats.healthScore}%
          </div>
          <div className="stat-label">Certified health score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.notesNeedingAttention}/{stats.notesMeasured}</div>
          <div className="stat-label">Notes needing work</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.measuredExpectedComponents}/{stats.certifiedExpectedComponents}</div>
          <div className="stat-label">Expected components certified</div>
        </div>
      </div>

      <div className="cert-start-card cert-start-card-muted">
        <strong>Reading guide:</strong> This issued report is now locked. Measured means at least 2 strikes confirmed the value. Not expected is for intentional octave-only tonefields. Inconclusive means the app heard the note but could not certify that partial strongly enough yet.
      </div>

      <div className="results-table-container">
        <h3 className="results-table-title">Issued per-note certification</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Status</th>
              <th>Fund.</th>
              <th>Octave</th>
              <th>5th</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((aggregate, noteIndex) => {
              const noteStatus = getCertificationNoteStatus(aggregate);
              const noteStatusClass = getCertificationStatusClassName(noteStatus);
              const showFundamental = aggregate.fundamental.status === 'measured' && aggregate.fundamental.cents !== null;
              const showOctave = aggregate.octave.status === 'measured' && aggregate.octave.cents !== null;
              const showFifth = aggregate.compoundFifth.status === 'measured' && aggregate.compoundFifth.cents !== null;

              return (
                <tr key={`${aggregate.noteName}-${noteIndex}`}>
                  <td className="result-note-name">{aggregate.noteName}</td>
                  <td>
                    <span className={`status-chip ${noteStatusClass}`}>
                      {getCertificationStatusLabel(noteStatus)}
                    </span>
                  </td>
                  <td>
                    {showFundamental ? (
                      <>
                        {formatCents(aggregate.fundamental.cents as number)}
                        {aggregate.fundamental.spreadCents !== null ? (
                          <div className="cert-spread">spread {aggregate.fundamental.spreadCents.toFixed(1)}c</div>
                        ) : null}
                      </>
                    ) : (
                      statusText(aggregate.fundamental)
                    )}
                  </td>
                  <td>
                    {showOctave ? (
                      <>
                        {formatCents(aggregate.octave.cents as number)}
                        {aggregate.octave.spreadCents !== null ? (
                          <div className="cert-spread">spread {aggregate.octave.spreadCents.toFixed(1)}c</div>
                        ) : null}
                      </>
                    ) : (
                      statusText(aggregate.octave)
                    )}
                  </td>
                  <td>
                    {showFifth ? (
                      <>
                        {formatCents(aggregate.compoundFifth.cents as number)}
                        {aggregate.compoundFifth.spreadCents !== null ? (
                          <div className="cert-spread">spread {aggregate.compoundFifth.spreadCents.toFixed(1)}c</div>
                        ) : null}
                      </>
                    ) : (
                      statusText(aggregate.compoundFifth)
                    )}
                  </td>
                  <td className="cert-confidence-cell">{aggregate.overallConfidence}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '-20000px',
          width: '1200px',
          maxWidth: '1200px',
          pointerEvents: 'none',
          zIndex: -1,
          overflow: 'hidden',
        }}
      >
        <CertificationShareCard aggregates={aggregates} verificationId={verificationId} />
      </div>

      <div className="page-actions" style={{ marginTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={shareCertifiedReport}>
          Download PNG Certificate
        </button>
        <button className="btn btn-secondary" onClick={() => navigate(`/verify?id=${encodeURIComponent(verificationId)}`)}>
          Verify this report
        </button>
      </div>

      <div className="page-actions results-actions">
        <button className="btn btn-primary" onClick={handleStartOver}>Start new session</button>
      </div>
    </div>
  );
};

export default CertificationResultsPage;
