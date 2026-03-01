/**
 * TuningResults – displays fundamental, octave, and fifth frequency readings
 * with color-coded deviation indicators.
 */

import { formatCents, centsToColor } from '../utils/musicUtils';
import type { TunerLiveResult } from '../hooks/useTuner';

interface TuningResultsProps {
  result: TunerLiveResult;
}

interface RowProps {
  label: string;
  frequency: number | null;
  cents: number | null;
  confidence: number;
}

function PartialRow({ label, frequency, cents, confidence }: RowProps) {
  const hasData = frequency !== null && cents !== null;
  const color = hasData ? centsToColor(cents) : '#555';
  const absCents = hasData ? Math.abs(cents) : null;
  const statusText =
    absCents === null ? '—' :
    absCents <= 2 ? 'Perfect' :
    absCents <= 10 ? 'Good' :
    absCents <= 20 ? 'Marginal' : 'Out of Tune';

  return (
    <tr className="tuning-results-row">
      <td className="tuning-results-label">{label}</td>
      <td className="tuning-results-freq">
        {frequency !== null ? `${frequency.toFixed(1)} Hz` : '—'}
      </td>
      <td className="tuning-results-cents" style={{ color }}>
        {hasData ? formatCents(cents) : '—'}
      </td>
      <td className="tuning-results-status" style={{ color }}>
        {statusText}
      </td>
      <td className="tuning-results-confidence">
        {hasData ? `${Math.round(confidence * 100)}%` : '—'}
      </td>
    </tr>
  );
}

export function TuningResults({ result }: TuningResultsProps) {
  const hasResult = result.noteName !== null;

  return (
    <div className="tuning-results">
      <div className="tuning-results-header">
        {hasResult ? (
          <>
            <span className="tuning-results-note">{result.noteName}</span>
            <span
              className="tuning-results-cents-large"
              style={{ color: result.fundamentalCents !== null ? centsToColor(result.fundamentalCents) : '#555' }}
            >
              {result.fundamentalCents !== null ? formatCents(result.fundamentalCents) : '—'}
            </span>
          </>
        ) : (
          <span className="tuning-results-idle">Strike a note to begin measurement</span>
        )}
      </div>

      <table className="tuning-results-table">
        <thead>
          <tr>
            <th>Partial</th>
            <th>Frequency</th>
            <th>Deviation</th>
            <th>Status</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          <PartialRow
            label="Fundamental"
            frequency={result.fundamentalFreq}
            cents={result.fundamentalCents}
            confidence={result.confidence}
          />
          <PartialRow
            label="Octave (2×)"
            frequency={result.octaveFreq}
            cents={result.octaveCents}
            confidence={result.confidence * 0.9}
          />
          <PartialRow
            label="Fifth (3×)"
            frequency={result.fifthFreq}
            cents={result.fifthCents}
            confidence={result.confidence * 0.85}
          />
        </tbody>
      </table>
    </div>
  );
}
