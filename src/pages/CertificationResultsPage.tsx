import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { useCertificationAggregates, useCertificationContext } from '../contexts/CertificationContext';
import { useAppContext } from '../contexts/AppContext';
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
import {
  createInstrumentForUser,
  getSuggestedInstrumentScale,
  listUserInstruments,
  moveCertifiedReportToInstrument,
  saveCertifiedReportToHistory,
  type InstrumentRecord,
} from '../utils/userHistory';

const CertificationResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useCertificationContext();
  const { dispatch: appDispatch } = useAppContext();
  const allAggregates = useCertificationAggregates();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [historySaveState, setHistorySaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'skipped'>('idle');
  const [historySaveMessage, setHistorySaveMessage] = useState<string>('');
  const [historyUser, setHistoryUser] = useState<User | null>(null);
  const [historyInstruments, setHistoryInstruments] = useState<InstrumentRecord[]>([]);
  const [savedInstrumentId, setSavedInstrumentId] = useState<string | null>(null);
  const [savedInstrumentName, setSavedInstrumentName] = useState<string>('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [moveState, setMoveState] = useState<'idle' | 'moving' | 'moved' | 'error'>('idle');
  const [moveMessage, setMoveMessage] = useState<string>('');
  const [newInstrumentName, setNewInstrumentName] = useState<string>('');
  const [createState, setCreateState] = useState<'idle' | 'creating' | 'created' | 'error'>('idle');
  const [createMessage, setCreateMessage] = useState<string>('');
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
  const suggestedScaleLabel = useMemo(() => getSuggestedInstrumentScale(aggregates), [aggregates]);

  const currentAssignedInstrument = useMemo(() => {
    if (!savedInstrumentId) return null;
    return historyInstruments.find((instrument) => instrument.id === savedInstrumentId) ?? null;
  }, [historyInstruments, savedInstrumentId]);

  const canShowAssignmentSection =
    historySaveState === 'saved'
    && Boolean(historyUser)
    && Boolean(savedInstrumentId);

  const hasOtherExistingInstruments = historyInstruments.some((instrument) => instrument.id !== savedInstrumentId);

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
      setHistoryUser(null);
      setHistoryInstruments([]);
      setSavedInstrumentId(null);
      setSavedInstrumentName('');
      setSelectedInstrumentId('');
      setNewInstrumentName('');
      return;
    }

    let cancelled = false;

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;

      if (error || !data.user) {
        setHistorySaveState('skipped');
        setHistorySaveMessage('Sign in to save this certified report to your personal history.');
        setHistoryUser(null);
        setHistoryInstruments([]);
        setSavedInstrumentId(null);
        setSavedInstrumentName('');
        setSelectedInstrumentId('');
        setNewInstrumentName('');
        return;
      }

      setHistoryUser(data.user);
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
        setSavedInstrumentId(result.instrumentId ?? null);
        setSavedInstrumentName(result.instrumentName ?? '');
        setMoveState('idle');
        setMoveMessage('');
        setCreateState('idle');
        setCreateMessage('');
        setNewInstrumentName('');

        const instrumentsResult = await listUserInstruments(data.user);
        if (cancelled) return;

        if (instrumentsResult.ok) {
          const instruments = instrumentsResult.instruments ?? [];
          setHistoryInstruments(instruments);
          setSelectedInstrumentId(result.instrumentId ?? instruments[0]?.id ?? '');
        } else {
          setHistoryInstruments([]);
          setSelectedInstrumentId(result.instrumentId ?? '');
        }
      } else {
        setHistorySaveState('error');
        setHistorySaveMessage(result.error ?? 'Could not save this certified report to your account history.');
        setSavedInstrumentId(null);
        setSavedInstrumentName('');
        setHistoryInstruments([]);
        setSelectedInstrumentId('');
        setNewInstrumentName('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [aggregates, reportRecord, reportSignature, state.finalizedAt, stats, verificationId, verdict]);

  useEffect(() => {
    if (moveState === 'moved' || moveState === 'error') {
      setMoveState('idle');
      setMoveMessage('');
    }
  }, [selectedInstrumentId]);

  const handleStartOver = () => {
    dispatch({ type: 'RESET_CERTIFICATION_SESSION' });
    navigate('/');
  };

  const handleContactClick = () => {
    appDispatch({ type: 'RESET_EVALUATION' });

    aggregates.forEach((aggregate, index) => {
      const noteStatus = getCertificationNoteStatus(aggregate);

      appDispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: index });
      appDispatch({
        type: 'ADD_TUNING_RESULT',
        payload: {
          noteName: aggregate.noteName,
          targetFrequency: 0,
          detectedFrequency: null,
          cents: aggregate.fundamental.status === 'measured' ? aggregate.fundamental.cents : null,
          status:
            noteStatus === 'in-tune'
              ? 'in-tune'
              : noteStatus === 'slightly-out-of-tune'
                ? 'slightly-out-of-tune'
                : noteStatus === 'out-of-tune'
                  ? 'out-of-tune'
                  : 'pending',
          octaveFreq: undefined,
          octaveCents: aggregate.octave.status === 'measured' ? aggregate.octave.cents ?? undefined : undefined,
          compoundFifthFreq: undefined,
          compoundFifthCents:
            aggregate.compoundFifth.status === 'measured' ? aggregate.compoundFifth.cents ?? undefined : undefined,
        },
      });
    });

    navigate('/contact');
  };

  const shareCertifiedReport = async () => {
    const safeVerificationId = verificationId.replace(/[^A-Z0-9-]/gi, '-').toLowerCase();
    await exportShareCard('certification-share-card', `dugimago-certified-tuning-report-${safeVerificationId}.png`);
  };

  const handleMoveReport = async () => {
    if (!historyUser || !savedInstrumentId || !selectedInstrumentId || selectedInstrumentId === savedInstrumentId) {
      return;
    }

    setMoveState('moving');
    setMoveMessage('Moving this saved report to the selected instrument…');
    setCreateState('idle');
    setCreateMessage('');

    const result = await moveCertifiedReportToInstrument({
      user: historyUser,
      verificationId,
      instrumentId: selectedInstrumentId,
    });

    if (!result.ok) {
      setMoveState('error');
      setMoveMessage(result.error ?? 'Could not move this certified report.');
      return;
    }

    setSavedInstrumentId(result.instrumentId ?? selectedInstrumentId);
    setSavedInstrumentName(result.instrumentName ?? savedInstrumentName);
    setMoveState('moved');
    setMoveMessage(`Report moved to ${result.instrumentName ?? 'the selected instrument'}.`);

    const instrumentsResult = await listUserInstruments(historyUser);
    if (instrumentsResult.ok) {
      setHistoryInstruments(instrumentsResult.instruments ?? []);
    }
  };

  const handleCreateInstrumentAndMoveReport = async () => {
    if (!historyUser || !savedInstrumentId) {
      return;
    }

    const trimmedName = newInstrumentName.trim();
    if (!trimmedName) {
      setCreateState('error');
      setCreateMessage('Enter a name for the new instrument first.');
      return;
    }

    setCreateState('creating');
    setCreateMessage('Creating a new instrument and moving this report…');
    setMoveState('idle');
    setMoveMessage('');

    const createResult = await createInstrumentForUser({
      user: historyUser,
      name: trimmedName,
      scaleLabel: suggestedScaleLabel ?? currentAssignedInstrument?.scale_label ?? null,
    });

    if (!createResult.ok || !createResult.instrument) {
      setCreateState('error');
      setCreateMessage(createResult.error ?? 'Could not create a new instrument.');
      return;
    }

    setHistoryInstruments((prev) => [createResult.instrument as InstrumentRecord, ...prev]);
    setSelectedInstrumentId(createResult.instrument.id);

    const moveResult = await moveCertifiedReportToInstrument({
      user: historyUser,
      verificationId,
      instrumentId: createResult.instrument.id,
    });

    if (!moveResult.ok) {
      setCreateState('error');
      setCreateMessage(`Instrument created as ${createResult.instrument.name}, but the report could not be moved. ${moveResult.error ?? ''}`.trim());
      return;
    }

    setSavedInstrumentId(moveResult.instrumentId ?? createResult.instrument.id);
    setSavedInstrumentName(moveResult.instrumentName ?? createResult.instrument.name);
    setCreateState('created');
    setCreateMessage(`Created ${moveResult.instrumentName ?? createResult.instrument.name} and moved this report there.`);
    setNewInstrumentName('');

    const instrumentsResult = await listUserInstruments(historyUser);
    if (instrumentsResult.ok) {
      setHistoryInstruments(instrumentsResult.instruments ?? []);
    }
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
        style={{ marginBottom: canShowAssignmentSection ? '1rem' : '1.5rem', borderColor: historySaveState === 'error' ? 'rgba(255,102,102,0.45)' : undefined }}
      >
        <strong>Account history:</strong> {historySaveState === 'saved' ? 'Saved' : historySaveState === 'saving' ? 'Saving…' : historySaveState === 'error' ? 'Save failed' : historySaveState === 'skipped' ? 'Sign in required' : 'Pending'}
        <br />
        {historySaveMessage || 'When you are signed in, this certified report is also saved automatically to your personal history.'}
      </div>

      {canShowAssignmentSection ? (
        <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1.5rem' }}>
          <strong>Assign this report</strong>
          <div style={{ marginTop: '0.5rem' }}>
            Currently saved under <strong>{currentAssignedInstrument?.name ?? savedInstrumentName ?? 'this instrument'}</strong>.
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Move to an existing instrument</div>
            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <select
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(e.target.value)}
                style={{
                  flex: '1 1 260px',
                  minWidth: '220px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #2f2f2f',
                  background: '#181818',
                  color: '#fff',
                  fontSize: '1rem',
                }}
              >
                {historyInstruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleMoveReport}
                disabled={moveState === 'moving' || !selectedInstrumentId || selectedInstrumentId === savedInstrumentId}
              >
                {moveState === 'moving' ? 'Moving…' : 'Move report'}
              </button>
            </div>
            <div style={{ marginTop: '0.75rem', color: moveState === 'error' ? '#ff9a9a' : '#d6d6d6' }}>
              {moveMessage || (
                hasOtherExistingInstruments
                  ? 'Choose one of your existing instruments to reassign this already-saved certified report.'
                  : 'This report is currently your only instrument entry. Create a new instrument below if you want to separate another D Kurd or similar instrument.'
              )}
            </div>
          </div>

          <div style={{ marginTop: '1.2rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Create a new instrument for this report</div>
            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                value={newInstrumentName}
                onChange={(e) => {
                  setNewInstrumentName(e.target.value);
                  if (createState === 'created' || createState === 'error') {
                    setCreateState('idle');
                    setCreateMessage('');
                  }
                }}
                placeholder={suggestedScaleLabel ? `e.g. ${suggestedScaleLabel} #2` : 'e.g. My second D Kurd'}
                style={{
                  flex: '1 1 260px',
                  minWidth: '220px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #2f2f2f',
                  background: '#181818',
                  color: '#fff',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateInstrumentAndMoveReport}
                disabled={createState === 'creating' || !newInstrumentName.trim()}
              >
                {createState === 'creating' ? 'Creating…' : 'Create and move report'}
              </button>
            </div>
            <div style={{ marginTop: '0.75rem', color: createState === 'error' ? '#ff9a9a' : '#d6d6d6' }}>
              {createMessage || 'This is useful when two different handpans share the same detected scale and you want separate instrument groups.'}
            </div>
          </div>
        </div>
      ) : null}

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
        <button className="btn btn-secondary" onClick={handleContactClick}>
          Request Professional Evaluation
        </button>
        <button className="btn btn-primary" onClick={handleStartOver}>Start new session</button>
      </div>
    </div>
  );
};

export default CertificationResultsPage;
