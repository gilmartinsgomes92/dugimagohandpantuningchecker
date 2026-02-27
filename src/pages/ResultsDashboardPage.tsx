import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { formatCents, centsToColor } from '../utils/musicUtils';

const ResultsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { tuningResults, selectedScale } = state;

  const stats = useMemo(() => {
    const scored = tuningResults.filter(r => r.status !== 'pending' && r.status !== 'skipped');
    const inTune = scored.filter(r => r.status === 'in-tune').length;
    const needsWork = scored.filter(r => r.status === 'flat' || r.status === 'sharp').length;
    const total = tuningResults.length;
    const healthScore = total > 0 ? Math.round((inTune / total) * 100) : 0;
    const avgDeviation = scored.length > 0
      ? scored.reduce((sum, r) => sum + Math.abs(r.cents ?? 0), 0) / scored.length
      : 0;
    const difficulty = avgDeviation <= 5 ? 'Simple' : avgDeviation <= 15 ? 'Moderate' : 'Complex';
    return { inTune, needsWork, total, healthScore, difficulty };
  }, [tuningResults]);

  const isGood = stats.healthScore >= 80;

  const handleStartOver = () => {
    dispatch({ type: 'RESET_EVALUATION' });
    navigate('/');
  };

  return (
    <div className="page results-page">
      <div className="results-verdict">
        <div className={`verdict-badge ${isGood ? 'verdict-good' : 'verdict-warn'}`}>
          {isGood ? '✅' : '⚠️'}
        </div>
        <h2 className="verdict-title">
          {isGood ? 'Your handpan is in tune!' : 'Retuning work recommended'}
        </h2>
        {selectedScale && <p className="verdict-scale">Scale: {selectedScale}</p>}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: isGood ? '#00ff88' : '#ff8800' }}>
            {stats.healthScore}%
          </div>
          <div className="stat-label">Overall Health Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.needsWork}/{stats.total}</div>
          <div className="stat-label">Notes Needing Work</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.difficulty}</div>
          <div className="stat-label">Tuning Difficulty</div>
        </div>
      </div>

      <div className="results-table-container">
        <h3 className="results-table-title">Detailed Results</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Status</th>
              <th>Deviation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tuningResults.map((r, i) => {
              const color = r.cents !== null ? centsToColor(r.cents) : '#555';
              const statusLabel =
                r.status === 'in-tune' ? 'In Tune' :
                r.status === 'flat' ? 'Flat' :
                r.status === 'sharp' ? 'Sharp' :
                r.status === 'skipped' ? 'Skipped' : 'Pending';
              return (
                <tr key={i}>
                  <td className="result-note-name">{r.noteName}</td>
                  <td>{statusLabel}</td>
                  <td style={{ color }}>{r.cents !== null ? formatCents(r.cents) : '—'}</td>
                  <td>
                    <span
                      className="result-dot"
                      style={{ background: r.cents !== null ? color : '#333' }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="page-actions results-actions">
        <button className="btn btn-primary" onClick={() => navigate('/contact')}>
          Continue to Contact Us →
        </button>
        <button className="btn btn-secondary" onClick={handleStartOver}>
          Start Over
        </button>
        <button className="btn btn-ghost btn-disabled" disabled>
          🔒 Save Results
        </button>
      </div>
    </div>
  );
};

export default ResultsDashboardPage;
