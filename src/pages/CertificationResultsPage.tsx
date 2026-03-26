import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCertificationAggregates, useCertificationContext } from '../contexts/CertificationContext';
import { formatCents } from '../utils/musicUtils';
import { statusText } from '../utils/certificationAggregation';
import CertificationShareCard from '../components/CertificationShareCard';
import { exportShareCard } from '../utils/exportShareCard';

const CertificationResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useCertificationContext();
  const aggregates = useCertificationAggregates();

  const stats = useMemo(() => {
    const notesMeasured = aggregates.filter((aggregate) => aggregate.strikeCount > 0);
    const highConfidence = notesMeasured.filter((aggregate) => aggregate.overallConfidence === 'high').length;
    const inconclusiveComponents = notesMeasured.reduce((count, aggregate) => {
      return count + [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth]
        .filter((component) => component.status === 'inconclusive').length;
    }, 0);
    const notExpectedComponents = notesMeasured.reduce((count, aggregate) => {
      return count + [aggregate.octave, aggregate.compoundFifth]
        .filter((component) => component.status === 'not-expected').length;
    }, 0);

    const expectedComponents = notesMeasured.reduce((count, aggregate) => {
      let total = count + 1; // fundamental always expected
      if (aggregate.expectations.octave) total += 1;
      if (aggregate.expectations.compoundFifth) total += 1;
      return total;
    }, 0);

    const measuredComponents = notesMeasured.reduce((count, aggregate) => {
      return count + [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth]
        .filter((component) => component.status === 'measured').length;
    }, 0);

    const componentValues = notesMeasured.flatMap((aggregate) => [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth])
      .filter((component) => component.status === 'measured' && typeof component.cents === 'number' && Number.isFinite(component.cents))
      .map((component) => Math.abs(component.cents as number));

    const certifiedHealthScore = componentValues.length
      ? Math.round((componentValues.filter((value) => value <= 12).length / componentValues.length) * 100)
      : 0;

    const notesNeedingWork = notesMeasured.filter((aggregate) => {
      const values = [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth]
        .filter((component) => component.status === 'measured' && typeof component.cents === 'number' && Number.isFinite(component.cents))
        .map((component) => Math.abs(component.cents as number));
      return values.some((value) => value > 12);
    }).length;

    return {
      notesMeasured: notesMeasured.length,
      highConfidence,
      inconclusiveComponents,
      notExpectedComponents,
      expectedComponents,
      measuredComponents,
      certifiedHealthScore,
      notesNeedingWork,
    };
  }, [aggregates]);

  const verdict = useMemo(() => {
    const measured = aggregates.flatMap((aggregate) => [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth])
      .filter((component) => component.status === 'measured' && typeof component.cents === 'number' && Number.isFinite(component.cents))
      .map((component) => Math.abs(component.cents as number));

    const hasInconclusiveExpected = aggregates.some((aggregate) =>
      [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth].some((component) => component.status === 'inconclusive'),
    );

    if (!measured.length) {
      return {
        title: 'Certification incomplete',
        subtitle: 'No components were certified strongly enough to produce a report yet.',
        className: 'verdict-warning',
      };
    }

    if (hasInconclusiveExpected) {
      return {
        title: 'Certification incomplete',
        subtitle: 'Some expected components are still inconclusive. Retesting those notes is recommended before sharing the report.',
        className: 'verdict-warning',
      };
    }

    if (measured.every((value) => value <= 12)) {
      return {
        title: 'This handpan is in tune',
        subtitle: 'All certified measured fundamentals and expected partials are within 12 cents.',
        className: 'verdict-good',
      };
    }

    if (measured.some((value) => value > 17)) {
      return {
        title: 'This handpan needs tuning attention',
        subtitle: 'At least one certified measured component is more than 17 cents off target.',
        className: 'verdict-attention',
      };
    }

    return {
      title: 'This handpan sounds good with room for fine tuning',
      subtitle: 'Certified measured components are mostly close, with some values between 12 and 17 cents.',
      className: 'verdict-warm',
    };
  }, [aggregates]);

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

  const handleDownloadCertificate = async () => {
    await exportShareCard('certification-share-card', 'dugimago-certified-tuning-report.png');
  };

  return (
    <div className="page results-page certification-results-page">
      <div className="results-verdict">
        <div className={`verdict-badge ${verdict.className}`}>📜</div>
        <h2 className="verdict-title">Certified Tuning Report</h2>
        <p className="verdict-subtitle">
          {verdict.title}. {verdict.subtitle}
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.notesMeasured}</div><div className="stat-label">Notes measured</div></div>
        <div className="stat-card"><div className="stat-value">{stats.highConfidence}</div><div className="stat-label">High confidence</div></div>
        <div className="stat-card"><div className="stat-value">{stats.inconclusiveComponents}</div><div className="stat-label">Inconclusive components</div></div>
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
              <th>Fund.</th>
              <th>Octave</th>
              <th>5th</th>
              <th>Confidence</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((aggregate, noteIndex) => (
              <tr key={`${aggregate.noteName}-${noteIndex}`}>
                <td className="result-note-name">{aggregate.noteName}</td>
                <td>
                  {aggregate.fundamental.cents !== null ? (
                    <>
                      {formatCents(aggregate.fundamental.cents)}
                      {aggregate.fundamental.spreadCents !== null ? <div className="cert-spread">spread {aggregate.fundamental.spreadCents.toFixed(1)}c</div> : null}
                    </>
                  ) : statusText(aggregate.fundamental)}
                </td>
                <td>
                  {aggregate.octave.status === 'measured' && aggregate.octave.cents !== null ? (
                    <>
                      {formatCents(aggregate.octave.cents)}
                      {aggregate.octave.spreadCents !== null ? <div className="cert-spread">spread {aggregate.octave.spreadCents.toFixed(1)}c</div> : null}
                    </>
                  ) : statusText(aggregate.octave)}
                </td>
                <td>
                  {aggregate.compoundFifth.status === 'measured' && aggregate.compoundFifth.cents !== null ? (
                    <>
                      {formatCents(aggregate.compoundFifth.cents)}
                      {aggregate.compoundFifth.spreadCents !== null ? <div className="cert-spread">spread {aggregate.compoundFifth.spreadCents.toFixed(1)}c</div> : null}
                    </>
                  ) : statusText(aggregate.compoundFifth)}
                </td>
                <td className="cert-confidence-cell">{aggregate.overallConfidence}</td>
                <td>
                  <button className="btn btn-ghost cert-inline-btn" onClick={() => toggleCompoundExpectation(noteIndex, aggregate.expectations.compoundFifth)}>
                    {aggregate.expectations.compoundFifth ? 'Mark octave-only' : 'Restore 5th expected'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <CertificationShareCard
          aggregates={aggregates}
          verdictLabel={verdict.title}
          verdictSummary={verdict.subtitle}
          certifiedHealthScore={stats.certifiedHealthScore}
          notesNeedingWork={stats.notesNeedingWork}
          measuredComponents={stats.measuredComponents}
          totalExpectedComponents={stats.expectedComponents}
        />
      </div>

      <div className="page-actions results-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/certification/check')}>Back to certification</button>
        <button className="btn btn-secondary" onClick={handleDownloadCertificate}>Download PNG Certificate</button>
        <button className="btn btn-primary" onClick={handleStartOver}>Start new session</button>
      </div>
    </div>
  );
};

export default CertificationResultsPage;
