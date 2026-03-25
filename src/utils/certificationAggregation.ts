import type {
  AggregatedComponentResult,
  CertificationConfidence,
  CertificationNoteAggregate,
  CertificationStrike,
  ExpectedPartials,
} from '../types/certification';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function spread(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0];
}

function confidenceFrom(validStrikeCount: number, spreadCents: number | null): CertificationConfidence {
  if (validStrikeCount >= 3 && spreadCents !== null && spreadCents <= 4) return 'high';
  if (validStrikeCount >= 2 && spreadCents !== null && spreadCents <= 8) return 'medium';
  if (validStrikeCount >= 2) return 'low';
  return 'uncertain';
}

function aggregateComponent(
  values: Array<number | null | undefined>,
  expected: boolean,
): AggregatedComponentResult {
  if (!expected) {
    return {
      status: 'not-expected',
      cents: null,
      spreadCents: null,
      validStrikeCount: 0,
      confidence: 'uncertain',
    };
  }

  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (valid.length < 2) {
    return {
      status: 'inconclusive',
      cents: valid.length === 1 ? valid[0] : null,
      spreadCents: null,
      validStrikeCount: valid.length,
      confidence: 'uncertain',
    };
  }

  const cents = median(valid);
  const spreadCents = spread(valid);

  return {
    status: 'measured',
    cents,
    spreadCents,
    validStrikeCount: valid.length,
    confidence: confidenceFrom(valid.length, spreadCents),
  };
}

function bestNoteName(strikes: CertificationStrike[]): string {
  if (!strikes.length) return 'Unknown';
  const counts = new Map<string, number>();
  for (const strike of strikes) {
    counts.set(strike.noteName, (counts.get(strike.noteName) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function overallConfidenceOf(results: AggregatedComponentResult[]): CertificationConfidence {
  const ranks: Record<CertificationConfidence, number> = {
    high: 4,
    medium: 3,
    low: 2,
    uncertain: 1,
  };

  const measured = results.filter((result) => result.status === 'measured');
  if (!measured.length) return 'uncertain';

  const worst = measured.reduce((acc, result) => (ranks[result.confidence] < ranks[acc] ? result.confidence : acc), 'high' as CertificationConfidence);
  return worst;
}

export function aggregateCertificationNote(
  strikes: CertificationStrike[],
  expectations: ExpectedPartials,
): CertificationNoteAggregate {
  const noteName = bestNoteName(strikes);
  const fundamental = aggregateComponent(strikes.map((strike) => strike.cents), true);
  const octave = aggregateComponent(strikes.map((strike) => strike.octaveCents), expectations.octave);
  const compoundFifth = aggregateComponent(
    strikes.map((strike) => strike.compoundFifthCents),
    expectations.compoundFifth,
  );

  return {
    noteName,
    strikeCount: strikes.length,
    strikes,
    expectations,
    fundamental,
    octave,
    compoundFifth,
    overallConfidence: overallConfidenceOf([fundamental, octave, compoundFifth]),
  };
}

export function statusText(result: AggregatedComponentResult): string {
  if (result.status === 'not-expected') return 'Not expected';
  if (result.status === 'inconclusive') return 'Inconclusive';
  return 'Measured';
}
