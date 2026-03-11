import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { formatCents, centsToColor } from '../utils/musicUtils';
import ShareResultCard from '../components/ShareResultCard';
import { exportShareCard } from '../utils/exportShareCard';

type PartialBand = 'aligned' | 'character' | 'funky' | 'retune' | 'unknown';

function bandForPartial(absCents: number): PartialBand {
  if (!Number.isFinite(absCents)) return 'unknown';
  if (absCents <= 10) return 'aligned';
  if (absCents <= 15) return 'character';
  if (absCents <= 20) return 'funky';
  return 'retune';
}

function bandRank(band: PartialBand): number {
  return band === 'aligned' ? 0 : band === 'character' ? 1 : band === 'funky' ? 2 : band === 'retune' ? 3 : -1;
}

const ResultsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { tuningResults, selectedScale } = state;

  const stats = useMemo(() => {
    const scored = tuningResults.filter(r => r.status !== 'pending' && r.status !== 'skipped');
    const inTune = scored.filter(r => r.status === 'in-tune').length;
    const slightlyOut = scored.filter(r => r.status === 'slightly-out-of-tune').length;
    const outOfTune = scored.filter(r => r.status === 'out-of-tune').length;
    const needsWork = slightlyOut + outOfTune;
    const total = tuningResults.length;
    const healthScore = total > 0 ? Math.round((inTune / total) * 100) : 0;
    const avgDeviation = scored.length > 0
      ? scored.reduce((sum, r) => sum + Math.abs(r.cents ?? 0), 0) / scored.length
      : 0;
    const difficulty = avgDeviation <= 7 ? 'Simple' : avgDeviation <= 15 ? 'Moderate' : 'Complex';
    return { inTune, slightlyOut, outOfTune, needsWork, total, healthScore, difficulty, scored };
  }, [tuningResults]);

  const partials = useMemo(() => {
    const scored = stats.scored;

    let aligned = 0;
    let character = 0;
    let funky = 0;
    let retune = 0;
    let unknown = 0;

    let worstBand: PartialBand = 'unknown';
    let worstAbs = 0;
    let worstNote: string | null = null;
    let worstWhich: 'octave' | 'fifth' | null = null;

    for (const r of scored) {
      const octave = r.octaveCents;
      const fifth = r.compoundFifthCents;

      const octaveAbs = octave === null || octave === undefined ? null : Math.abs(octave);
      const fifthAbs = fifth === null || fifth === undefined ? null : Math.abs(fifth);

      const octaveBand = octaveAbs === null ? 'unknown' : bandForPartial(octaveAbs);
      const fifthBand = fifthAbs === null ? 'unknown' : bandForPartial(fifthAbs);

      // choose worst for this note
      const bands: Array<{ band: PartialBand; abs: number; which: 'octave' | 'fifth' }> = [];
      if (octaveAbs !== null) bands.push({ band: octaveBand, abs: octaveAbs, which: 'octave' });
      if (fifthAbs !== null) bands.push({ band: fifthBand, abs: fifthAbs, which: 'fifth' });

      if (bands.length === 0) {
        unknown += 1;
        continue;
      }

      const worstForNote = bands.reduce((a, b) => (bandRank(b.band) > bandRank(a.band) ? b : a));
      if (worstForNote.band === 'aligned') aligned += 1;
      else if (worstForNote.band === 'character') character += 1;
      else if (worstForNote.band === 'funky') funky += 1;
      else if (worstForNote.band === 'retune') retune += 1;
      else unknown += 1;

      // track global worst (prefer higher band, tie-break by abs)
      if (
        bandRank(worstForNote.band) > bandRank(worstBand) ||
        (worstForNote.band === worstBand && worstForNote.abs > worstAbs)
      ) {
        worstBand = worstForNote.band;
        worstAbs = worstForNote.abs;
        worstNote = r.noteName ?? null;
        worstWhich = worstForNote.which;
      }
    }

    return { aligned, character, funky, retune, unknown, worstBand, worstAbs, worstNote, worstWhich };
  }, [stats.scored]);

  const verdict = stats.outOfTune > 0
    ? { label: 'The handpan is out of tune', badge: '❌', className: 'verdict-bad' }
    : stats.slightlyOut > 0
    ? { label: 'Your handpan sounds good with some room for fine tuning', badge: '✅', className: 'verdict-warn' }
    : { label: 'The handpan is in tune', badge: '✅', className: 'verdict-good' };

  const partialsMessage = useMemo(() => {
    // If fundamentals are out, the main message is already clear; tailor the partials line.
    if (stats.outOfTune > 0) {
      if (partials.worstBand === 'retune' || partials.worstBand === 'funky') {
        return {
          badge: '❌',
          text: 'Partials are also drifting — a full retune is recommended.',
        };
      }
      if (partials.worstBand === 'character') {
        return {
          badge: 'ℹ️',
          text: 'Partials show slight drift, but the main issue is that some fundamentals are off.',
        };
      }
      return {
        badge: 'ℹ️',
        text: 'Partials look relatively aligned, but some fundamentals are off.',
      };
    }

    if (partials.worstBand === 'retune') {
      return {
        badge: '❌',
        text: 'Your fundamentals are mostly OK, but your partials likely need retuning (octave and/or fifth > 20 cents off).',
      };
    }
    if (partials.worstBand === 'funky') {
      return {
        badge: '⚠️',
        text: 'Your handpan is in tune, but it may sound a bit funky/wavy — some octaves or fifths are ~15–20 cents off.',
      };
    }
    if (partials.worstBand === 'character') {
      return {
        badge: 'ℹ️',
        text: 'Your handpan is in tune with some character — slight partial drift (~10–15 cents).',
      };
    }
    if (partials.worstBand === 'aligned') {
      return {
        badge: '✅',
        text: 'Octaves and fifths look well aligned.',
      };
    }
    return {
      badge: 'ℹ️',
      text: 'Partials data was limited — try again with longer ring time per note.',
    };
  }, [stats.outOfTune, partials.worstBand]);

  const worstPartialHint = useMemo(() => {
    if (!partials.worstNote || !Number.isFinite(partials.worstAbs) || partials.worstAbs <= 0) return null;
    const whichLabel = partials.worstWhich === 'octave' ? 'Octave' : partials.worstWhich === 'fifth' ? '5th' : 'Partial';
    return `${whichLabel} worst-case: ${partials.worstNote} at ±${Math.round(partials.worstAbs)}c`;
  }, [partials.worstNote, partials.worstAbs, partials.worstWhich]);

  const handleStartOver = () => {
    dispatch({ type: 'RESET_TUNING_SESSION' });
    dispatch({ type: 'RESET_EVALUATION' });
    navigate('/');
  };

  const shareResult = async () => {
  await exportShareCard();
};

  return (
    <div className="page results-page">
      <div className="results-verdict">
        <div className={`verdict-badge ${verdict.className}`}>
          {verdict.badge}
        </div>
        <h2 className="verdict-title">
          {verdict.label}
        </h2>
        <p className="verdict-subtitle">
          {partialsMessage.badge} {partialsMessage.text}
          {worstPartialHint ? <span className="verdict-hint"> ({worstPartialHint})</span> : null}
        </p>
        {selectedScale && <p className="verdict-scale">Scale: {selectedScale}</p>}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: verdict.className === 'verdict-good' ? '#00ff88' : '#ff8800' }}>
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
              <th>Fundamental</th>
              <th>Octave</th>
              <th>5th</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tuningResults.map((r, i) => {
              const color = r.cents !== null ? centsToColor(r.cents) : '#555';
              const octaveColor = r.octaveCents !== null && r.octaveCents !== undefined ? centsToColor(r.octaveCents) : '#555';
              const fifthColor = r.compoundFifthCents !== null && r.compoundFifthCents !== undefined ? centsToColor(r.compoundFifthCents) : '#555';
              const statusLabel =
                r.status === 'in-tune' ? 'In Tune' :
                r.status === 'slightly-out-of-tune' ? 'Slightly Out' :
                r.status === 'out-of-tune' ? 'Out of Tune' :
                r.status === 'skipped' ? 'Skipped' : 'Pending';
              return (
                <tr key={i}>
                  <td className="result-note-name">{r.noteName}</td>
                  <td>{statusLabel}</td>
                  <td style={{ color }}>{r.cents !== null ? formatCents(r.cents) : '—'}</td>
                  <td style={{ color: octaveColor }}>
                    {r.octaveCents !== undefined ? formatCents(r.octaveCents) : '—'}
                  </td>
                  <td style={{ color: fifthColor }}>
                    {r.compoundFifthCents !== undefined ? formatCents(r.compoundFifthCents) : '—'}
                  </td>
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

   <div
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
  }}
>
  <ShareResultCard
    selectedScale={selectedScale ?? 'Unknown'}
    tuningResults={tuningResults}
  />
</div>

    <button className="btn btn-secondary" onClick={shareResult}>
  Share Result
</button>

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
