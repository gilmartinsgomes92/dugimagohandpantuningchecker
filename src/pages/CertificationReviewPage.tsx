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
import { generateVerificationId } from '../utils/verificationId';
import { certificationAggregateSortKey } from '../utils/certificationOrder';
import InlineLegalNotice from '../components/InlineLegalNotice';

const CertificationReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useCertificationContext();
  const allAggregates = useCertificationAggregates();

  const orderedAggregateEntries = useMemo(
    () => allAggregates
      .map((aggregate, index) => ({ aggregate, index }))
      .filter(({ aggregate }) => aggregate.strikeCount > 0)
      .sort((a, b) => {
        const keyDiff = certificationAggregateSortKey(a.aggregate) - certificationAggregateSortKey(b.aggregate);
        if (keyDiff !== 0) return keyDiff;
        return a.aggregate.noteName.localeCompare(b.aggregate.noteName);
      }),
    [allAggregates],
  );

  const aggregates = useMemo(
    () => orderedAggregateEntries.map(({ aggregate }) => aggregate),
    [orderedAggregateEntries],
  );

  const stats = useMemo(() => getCertificationReportStats(aggregates), [aggregates]);
  const verdict = useMemo(() => getCertificationVerdict(stats), [stats]);

  const toggleCompoundExpectation = (noteIndex: number, current: boolean) => {
    dispatch({
      type: 'SET_NOTE_EXPECTATIONS',
      payload: { noteIndex, expectations: { compoundFifth: !current } },
    });
  };

  const handleFinalize = () => {
    const verificationId = generateVerificationId();
    dispatch({
      type: 'FINALIZE_CERTIFICATION_REPORT',
      payload: { verificationId, finalizedAt: new Date().toISOString() },
    });
    navigate('/certification/results');
  };

  if (!state.notesCount) {
    navigate('/certification/start');
    return null;
  }

  if (state.finalizedAt && state.verificationId) {
    navigate('/certification/results');
    return null;
  }

  return (
    <div className="page results-page certification-results-page">
      <div className="cert-start-card cert-start-card-muted" style={{ marginBottom: '1rem' }}>
        <strong>Review before issuing:</strong> this step is still editable.
        <br />
        Confirm octave-only notes now. Finalizing will lock this report, assign its permanent verification ID, and save the original record to the verification registry.
      </div>

      <div className="results-verdict">
        <div className={`verdict-badge ${verdict.className}`}>{verdict.badge}</div>
        <h2 className="verdict-title">Review Certified Tuning Report</h2>
        <p className="verdict-subtitle">{verdict.subtitle}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: verdict.className === 'verdict-good' ? '#00ff88' : verdict.className === 'verdict-bad' ? '#ff6666' : '#ffaa00' }}>
            {stats.healthScore}%
          </div>
          <div className="stat-label">Projected health score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.notesNeedingAttention}/{stats.notesMeasured}</div>
          <div className="stat-label">Notes needing work</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.measuredExpectedComponents}/{stats.certifiedExpectedComponents}</div>
          <div className="stat-label">Expected components confirmed</div>
        </div>
      </div>

      <div className="cert-start-card cert-start-card-muted">
        <strong>Reading guide:</strong> Measured means at least 2 strikes confirmed the value. Not expected is for intentional octave-only tonefields. Inconclusive means the app heard the note but could not certify that partial strongly enough yet.
      </div>

      <div className="results-table-container">
        <h3 className="results-table-title">Review per-note certification</h3>
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
            {orderedAggregateEntries.map(({ aggregate, index: noteIndex }) => {
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

      <InlineLegalNotice variant="certification" />

      <div className="page-actions" style={{ marginTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/certification/check')}>
          Back to measurement
        </button>
        <button className="btn btn-primary" onClick={handleFinalize}>
          Finalize Certified Report
        </button>
      </div>
    </div>
  );
};

export default CertificationReviewPage;
