import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, type TuningResult } from '../contexts/AppContext';
import { formatCents, centsToColor } from '../utils/musicUtils';
import ShareResultCard from '../components/ShareResultCard';
import { exportShareCard } from '../utils/exportShareCard';

const NOTE_ORDER: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

function parseSortableNote(noteName: string): { order: number; normalized: string } | null {
  const trimmed = noteName.trim();
  const match = trimmed.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!match) return null;

  const [, pitchClass, octaveText] = match;
  const noteOrder = NOTE_ORDER[pitchClass];
  const octave = Number(octaveText);

  if (noteOrder === undefined || !Number.isFinite(octave)) return null;

  return {
    order: (octave + 1) * 12 + noteOrder,
    normalized: trimmed,
  };
}

function formatQuickTuningScale(tuningResults: TuningResult[]): string | null {
  const uniqueNotes = new Map<number, string>();

  for (const result of tuningResults) {
    const noteName = result.noteName;
    if (!noteName) continue;

    const parsed = parseSortableNote(noteName);
    if (!parsed) continue;

    if (!uniqueNotes.has(parsed.order)) {
      uniqueNotes.set(parsed.order, parsed.normalized);
    }
  }

  if (!uniqueNotes.size) return null;

  return [...uniqueNotes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, note]) => note)
    .join(' ');
}

type PartialBand = 'aligned' | 'character' | 'retune' | 'unknown';

function getBandFromAbs(absCents: number): PartialBand {
  if (!Number.isFinite(absCents)) return 'unknown';
  if (absCents <= 12) return 'aligned';
  if (absCents <= 17) return 'character';
  return 'retune';
}

function bandRank(band: PartialBand): number {
  return band === 'aligned' ? 0 : band === 'character' ? 1 : band === 'retune' ? 2 : -1;
}

function getComponentBand(cents: number | null | undefined): PartialBand {
  if (cents === null || cents === undefined) return 'unknown';
  return getBandFromAbs(Math.abs(cents));
}

function getNoteStatus(result: TuningResult): TuningResult['status'] {
  const bands = [
    getComponentBand(result.cents),
    getComponentBand(result.octaveCents),
    getComponentBand(result.compoundFifthCents),
  ];

  if (bands.includes('retune')) return 'out-of-tune';
  if (bands.includes('character')) return 'slightly-out-of-tune';
  return 'in-tune';
}

function noteNeedsAttention(result: TuningResult): boolean {
  const values = [result.cents, result.octaveCents, result.compoundFifthCents]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!values.length) return false;
  return values.some((value) => Math.abs(value) > 12);
}

function getHealthScore(results: TuningResult[]): number {
  const componentValues = results.flatMap((result) => [result.cents, result.octaveCents, result.compoundFifthCents])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!componentValues.length) return 0;

  const inTuneComponents = componentValues.filter((value) => Math.abs(value) <= 12).length;
  return Math.round((inTuneComponents / componentValues.length) * 100);
}

const ResultsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { tuningResults, selectedScale } = state;

  const displayScale = useMemo(() => {
    if (selectedScale !== 'Quick Tuning Check') return selectedScale;
    return formatQuickTuningScale(tuningResults) ?? selectedScale;
  }, [selectedScale, tuningResults]);

  const stats = useMemo(() => {
    const scored = tuningResults.filter(r => r.status !== 'pending' && r.status !== 'skipped');
    const noteStatuses = scored.map(getNoteStatus);
    const inTune = noteStatuses.filter((status) => status === 'in-tune').length;
    const slightlyOut = noteStatuses.filter((status) => status === 'slightly-out-of-tune').length;
    const outOfTune = noteStatuses.filter((status) => status === 'out-of-tune').length;
    const needsWork = scored.filter(noteNeedsAttention).length;
    const total = tuningResults.length;
    const healthScore = getHealthScore(scored);
    const avgDeviation = scored.length > 0
      ? scored.reduce((sum, r) => sum + Math.abs(r.cents ?? 0), 0) / scored.length
      : 0;
    const difficulty = avgDeviation <= 7 ? 'Simple' : avgDeviation <= 15 ? 'Moderate' : 'Complex';
    return { inTune, slightlyOut, outOfTune, needsWork, total, healthScore, difficulty, scored, noteStatuses };
  }, [tuningResults]);

  const partials = useMemo(() => {
    const scored = stats.scored;

    let aligned = 0;
    let character = 0;
    let retune = 0;
    let unknown = 0;

    let worstBand: PartialBand = 'unknown';
    let worstAbs = 0;
    let worstNote: string | null = null;
    let worstWhich: 'fundamental' | 'octave' | 'fifth' | null = null;

    for (const r of scored) {
      const values: Array<{ band: PartialBand; abs: number; which: 'fundamental' | 'octave' | 'fifth' }> = [];

      if (typeof r.cents === 'number' && Number.isFinite(r.cents)) {
        values.push({ band: getBandFromAbs(Math.abs(r.cents)), abs: Math.abs(r.cents), which: 'fundamental' });
      }
      if (typeof r.octaveCents === 'number' && Number.isFinite(r.octaveCents)) {
        values.push({ band: getBandFromAbs(Math.abs(r.octaveCents)), abs: Math.abs(r.octaveCents), which: 'octave' });
      }
      if (typeof r.compoundFifthCents === 'number' && Number.isFinite(r.compoundFifthCents)) {
        values.push({ band: getBandFromAbs(Math.abs(r.compoundFifthCents)), abs: Math.abs(r.compoundFifthCents), which: 'fifth' });
      }

      if (!values.length) {
        unknown += 1;
        continue;
      }

      const worstForNote = values.reduce((a, b) => (
        bandRank(b.band) > bandRank(a.band) || (bandRank(b.band) === bandRank(a.band) && b.abs > a.abs) ? b : a
      ));

      if (worstForNote.band === 'aligned') aligned += 1;
      else if (worstForNote.band === 'character') character += 1;
      else if (worstForNote.band === 'retune') retune += 1;
      else unknown += 1;

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

    return { aligned, character, retune, unknown, worstBand, worstAbs, worstNote, worstWhich };
  }, [stats.scored]);

  const verdict = stats.outOfTune > 0
    ? { label: 'Your handpan needs tuning attention', badge: '⚠️', className: 'verdict-bad' }
    : stats.slightlyOut > 0
    ? { label: 'Your handpan sounds good with some room for fine tuning', badge: '✅', className: 'verdict-warn' }
    : { label: 'The handpan is in tune', badge: '✅', className: 'verdict-good' };

  const partialsMessage = useMemo(() => {
    if (partials.worstBand === 'retune') {
      return {
        badge: '⚠️',
        text: 'At least one fundamental, octave, or compound fifth is more than 17 cents off.',
      };
    }
    if (partials.worstBand === 'character') {
      return {
        badge: 'ℹ️',
        text: 'Some components are between 12 and 17 cents off and may benefit from fine tuning.',
      };
    }
    if (partials.worstBand === 'aligned') {
      return {
        badge: '✅',
        text: 'All checked fundamentals, octaves, and compound fifths are within 12 cents.',
      };
    }
    return {
      badge: 'ℹ️',
      text: 'Partials data was limited — try again with a longer ring time per note.',
    };
  }, [partials.worstBand]);

  const worstPartialHint = useMemo(() => {
    if (!partials.worstNote || !Number.isFinite(partials.worstAbs) || partials.worstAbs <= 0) return null;
    const whichLabel =
      partials.worstWhich === 'fundamental' ? 'Fundamental' :
      partials.worstWhich === 'octave' ? 'Octave' :
      partials.worstWhich === 'fifth' ? 'Compound 5th' : 'Component';
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
        {displayScale && <p className="verdict-scale">Scale: {displayScale}</p>}
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
              const computedStatus = r.status === 'skipped' || r.status === 'pending' ? r.status : getNoteStatus(r);
              const statusLabel =
                computedStatus === 'in-tune' ? 'In Tune' :
                computedStatus === 'slightly-out-of-tune' ? 'Slightly Out' :
                computedStatus === 'out-of-tune' ? 'Out of Tune' :
                computedStatus === 'skipped' ? 'Skipped' : 'Pending';
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
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <ShareResultCard
          selectedScale={displayScale ?? 'Unknown'}
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
