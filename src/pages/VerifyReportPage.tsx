import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatCents } from '../utils/musicUtils';
import { statusText } from '../utils/certificationAggregation';
import {
  getCertificationNoteStatus,
  getCertificationStatusClassName,
  getCertificationStatusLabel,
} from '../utils/certificationReportUtils';
import { fetchCertificationReport } from '../utils/reportRegistry';
import { orderCertificationAggregates } from '../utils/certificationOrder';
import type { CertificationReportRecord } from '../types/reportRegistry';

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const VerifyReportPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [verificationId, setVerificationId] = useState(searchParams.get('id') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CertificationReportRecord | null>(null);

  const normalizedId = useMemo(() => verificationId.trim().toUpperCase(), [verificationId]);

  const handleLookup = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!normalizedId) {
      setError('Enter a verification ID to check the original certified report.');
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await fetchCertificationReport(normalizedId);
    setLoading(false);

    if (!result.ok || !result.report) {
      setReport(null);
      setError(result.error ?? 'Report not found.');
      return;
    }

    setReport(result.report);
  };


  useEffect(() => {
    if (searchParams.get('id')) {
      void handleLookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page results-page certification-results-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/')}>← Back</button>
      </div>

      <div className="results-verdict">
        <div className="verdict-badge verdict-good">🔎</div>
        <h2 className="verdict-title">Verify Certified Report</h2>
        <p className="verdict-subtitle">
          Enter a verification ID to confirm that a Certified Tuning Report matches the original record stored by Dugimago Handpan Tuning Check.
        </p>
      </div>

      <form className="cert-start-card" onSubmit={handleLookup}>
        <label htmlFor="verification-id-input" style={{ display: 'block', fontWeight: 700, marginBottom: '0.6rem' }}>
          Verification ID
        </label>
        <input
          id="verification-id-input"
          className="contact-input"
          value={verificationId}
          onChange={(event) => setVerificationId(event.target.value.toUpperCase())}
          placeholder="DUGI-20260328-ABC123"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="page-actions" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Verify report'}
          </button>
        </div>
        {error ? (
          <div className="cert-start-card cert-start-card-muted" style={{ marginTop: '1rem', borderColor: 'rgba(255,102,102,0.45)' }}>
            {error}
          </div>
        ) : null}
      </form>

      {report ? (
        <>
          <div className="cert-start-card cert-start-card-muted" style={{ marginTop: '1rem' }}>
            <strong>Verification ID:</strong> {report.verificationId}
            <br />
            <strong>Stored at:</strong> {formatCreatedAt(report.createdAt)}
            <br />
            <strong>App version:</strong> {report.appVersion}
          </div>

          <div className="results-verdict">
            <div className={`verdict-badge ${report.verdict.className}`}>{report.verdict.badge}</div>
            <h2 className="verdict-title">{report.verdict.label}</h2>
            <p className="verdict-subtitle">{report.verdict.subtitle}</p>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{report.stats.healthScore}%</div>
              <div className="stat-label">Certified health score</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{report.stats.notesMeasured}</div>
              <div className="stat-label">Notes measured</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{report.stats.measuredExpectedComponents}/{report.stats.certifiedExpectedComponents}</div>
              <div className="stat-label">Expected components certified</div>
            </div>
          </div>

          <div className="results-table-container">
            <h3 className="results-table-title">Stored certified results</h3>
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
                {orderCertificationAggregates(report.aggregates).map((aggregate, index) => {
                  const noteStatus = getCertificationNoteStatus(aggregate);
                  const noteStatusClass = getCertificationStatusClassName(noteStatus);
                  return (
                    <tr key={`${aggregate.noteName}-${index}`}>
                      <td className="result-note-name">{aggregate.noteName}</td>
                      <td>
                        <span className={`status-chip ${noteStatusClass}`}>{getCertificationStatusLabel(noteStatus)}</span>
                      </td>
                      <td>{aggregate.fundamental.status === 'measured' && aggregate.fundamental.cents !== null ? formatCents(aggregate.fundamental.cents) : statusText(aggregate.fundamental)}</td>
                      <td>{aggregate.octave.status === 'measured' && aggregate.octave.cents !== null ? formatCents(aggregate.octave.cents) : statusText(aggregate.octave)}</td>
                      <td>{aggregate.compoundFifth.status === 'measured' && aggregate.compoundFifth.cents !== null ? formatCents(aggregate.compoundFifth.cents) : statusText(aggregate.compoundFifth)}</td>
                      <td className="cert-confidence-cell">{aggregate.overallConfidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default VerifyReportPage;
