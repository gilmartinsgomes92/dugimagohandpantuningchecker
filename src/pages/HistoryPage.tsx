/**
 * HistoryPage – displays all stored tuning sessions and their measurements.
 *
 * Provides session deletion, clear-all, JSON export, and CSV export actions.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTuningStorage } from '../hooks/useTuningStorage';
import { formatCents, centsToColor } from '../utils/musicUtils';

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessions, deleteSession, clearAll, exportJSON, exportCSV } = useTuningStorage();

  const handleExportJSON = () => {
    downloadFile(exportJSON(), 'tuning_history.json', 'application/json');
  };

  const handleExportCSV = () => {
    downloadFile(exportCSV(), 'tuning_history.csv', 'text/csv');
  };

  return (
    <div className="page history-page">
      <div className="page-header">
        <button className="btn btn-ghost btn-back" onClick={() => navigate('/tuner')}>
          ← Back to Tuner
        </button>
        <h2 className="page-title">Tuning History</h2>
      </div>

      <div className="history-actions">
        <button className="btn btn-secondary" onClick={handleExportJSON}>
          ⬇ Export JSON
        </button>
        <button className="btn btn-secondary" onClick={handleExportCSV}>
          ⬇ Export CSV
        </button>
        {sessions.length > 0 && (
          <button
            className="btn btn-ghost history-clear-btn"
            onClick={() => { if (confirm('Clear all history?')) clearAll(); }}
          >
            🗑 Clear All
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="history-empty">
          <p>No tuning history yet.</p>
          <button className="btn btn-primary" onClick={() => navigate('/tuner')}>
            Start a Measurement
          </button>
        </div>
      ) : (
        <div className="history-sessions">
          {sessions.map(session => (
            <div key={session.id} className="history-session-card">
              <div className="history-session-header">
                <span className="history-session-date">
                  {session.date.toLocaleString()}
                </span>
                <span className="history-session-count">
                  {session.measurements.length} measurement{session.measurements.length !== 1 ? 's' : ''}
                </span>
                <button
                  className="btn btn-ghost history-delete-btn"
                  onClick={() => deleteSession(session.id)}
                  aria-label="Delete session"
                >
                  🗑
                </button>
              </div>

              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Instrument</th>
                    <th>Note</th>
                    <th>Fundamental</th>
                    <th>Octave</th>
                    <th>Fifth</th>
                  </tr>
                </thead>
                <tbody>
                  {session.measurements.map((m, i) => {
                    const fundColor = centsToColor(m.fundamental.deviation);
                    const octColor = m.octave.frequency > 0 ? centsToColor(m.octave.deviation) : '#555';
                    const fifthColor = m.fifth.frequency > 0 ? centsToColor(m.fifth.deviation) : '#555';
                    return (
                      <tr key={i}>
                        <td>{m.timestamp.toLocaleTimeString()}</td>
                        <td>{m.handpan}</td>
                        <td className="history-note">{m.note}</td>
                        <td style={{ color: fundColor }}>{formatCents(m.fundamental.deviation)}</td>
                        <td style={{ color: octColor }}>
                          {m.octave.frequency > 0 ? formatCents(m.octave.deviation) : '—'}
                        </td>
                        <td style={{ color: fifthColor }}>
                          {m.fifth.frequency > 0 ? formatCents(m.fifth.deviation) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
