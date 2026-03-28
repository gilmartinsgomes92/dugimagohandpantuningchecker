import React, { useMemo } from 'react';
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

const CertificationResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useCertificationContext();
  const allAggregates = useCertificationAggregates();

  const aggregates = useMemo(
    () => allAggregates.filter((aggregate) => aggregate.strikeCount > 0),
    [allAggregates],
  );

  const stats = useMemo(() => getCertificationReportStats(aggregates), [aggregates]);
  const verdict = useMemo(() => getCertificationVerdict(stats), [stats]);

  const handleStartOver = () => {
    dispatch({ type: 'RESET_CERTIFICATION_SESSION' });
    navigate('/');
  };

  const toggleCompoundExpectation = (noteIndex: number, current: boolean) => {
    dispatch({
      type: 'SET_NOTE_EXPECTATIONS',
      payload: { noteIndex, expectations: { compoundFifth: !current } },
    });
  };

  const verificationId = state.verificationId ?? 'Pending';

  const shareCertifiedReport = async () => {
    const safeVerificationId = verificationId.replace(/[^A-Z0-9-]/gi, '-').toLowerCase();
    await exportShareCard('certification-share-card', `dugimago-certified-tuning-report-${safeVerificationId}.png`);
  };

  return (
    <div className="page results-page certification-results-page">
      <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1rem' }}>
        <strong>Verification ID:</strong> {verificationId}
        <br />
        Keep this number with the certificate. It will be the reference used to confirm the original report later.
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
        <strong>Reading guide:</strong> Measured means at least 2 strikes confirmed the value. Not expected is for intentional octave-only tonefields. Inconclusive means the app heard the note but could not certify that partial strongly enough yet.
      </div>

      <div className="results-table-container">
        <h3 className="results-table-title">Per-note certification</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Status</th>
              <th>Fund.</th>
              <th>Octave</th>
              <th>5th</th>
              <th>Confidence</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {allAggregates.map((aggregate, noteIndex) => {
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
                  <td>
                    <button
                      className="btn btn-ghost cert-inline-btn"
                      onClick={() => toggleCompoundExpectation(noteIndex, aggregate.expectations.compoundFifth)}
                    >
                      {aggregate.expectations.compoundFifth ? 'Mark octave-only' : 'Restore 5th expected'}
                    </button>
                  </td>
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
          left: '-200vw',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <CertificationShareCard aggregates={aggregates} verificationId={verificationId} />
      </div>

      <button className="btn btn-secondary" onClick={shareCertifiedReport}>
        Download PNG Certificate
      </button>

      <div className="page-actions results-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/certification/check')}>
          Back to certification
        </button>
        <button className="btn btn-primary" onClick={handleStartOver}>Start new session</button>
      </div>
    </div>
  );
};

export default CertificationResultsPage;
