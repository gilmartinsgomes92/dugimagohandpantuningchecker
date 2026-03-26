import type {
  AggregatedComponentResult,
  CertificationConfidence,
  CertificationNoteAggregate,
} from '../types/certification';

export type CertificationTuningStatus =
  | 'in-tune'
  | 'slightly-out-of-tune'
  | 'out-of-tune'
  | 'inconclusive';

export type CertificationVerdict = {
  label: string;
  badge: string;
  className: 'verdict-good' | 'verdict-warn' | 'verdict-bad';
  subtitle: string;
};

export type CertificationReportStats = {
  notesMeasured: number;
  highConfidence: number;
  inconclusiveComponents: number;
  notExpectedComponents: number;
  inTuneNotes: number;
  slightlyOutNotes: number;
  outOfTuneNotes: number;
  notesNeedingAttention: number;
  certifiedExpectedComponents: number;
  measuredExpectedComponents: number;
  healthScore: number;
};

function getMeasuredBand(result: AggregatedComponentResult): CertificationTuningStatus {
  if (result.status !== 'measured' || result.cents === null || !Number.isFinite(result.cents)) {
    return 'inconclusive';
  }

  const absCents = Math.abs(result.cents);
  if (absCents <= 12) return 'in-tune';
  if (absCents <= 17) return 'slightly-out-of-tune';
  return 'out-of-tune';
}

function getMeasuredComponents(aggregate: CertificationNoteAggregate): AggregatedComponentResult[] {
  return [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth].filter(
    (component) => component.status === 'measured',
  );
}

function getExpectedComponents(aggregate: CertificationNoteAggregate): AggregatedComponentResult[] {
  return [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth].filter(
    (component) => component.status !== 'not-expected',
  );
}

export function getCertificationNoteStatus(
  aggregate: CertificationNoteAggregate,
): CertificationTuningStatus {
  const measuredComponents = getMeasuredComponents(aggregate);

  if (measuredComponents.some((component) => getMeasuredBand(component) === 'out-of-tune')) {
    return 'out-of-tune';
  }

  if (getExpectedComponents(aggregate).some((component) => component.status === 'inconclusive')) {
    return 'inconclusive';
  }

  if (measuredComponents.some((component) => getMeasuredBand(component) === 'slightly-out-of-tune')) {
    return 'slightly-out-of-tune';
  }

  if (measuredComponents.length > 0) return 'in-tune';
  return 'inconclusive';
}

export function getCertificationStatusLabel(status: CertificationTuningStatus): string {
  if (status === 'in-tune') return 'In Tune';
  if (status === 'slightly-out-of-tune') return 'Slightly Out';
  if (status === 'out-of-tune') return 'Out of Tune';
  return 'Inconclusive';
}

export function getCertificationStatusClassName(status: CertificationTuningStatus): string {
  if (status === 'in-tune') return 'status-in-tune';
  if (status === 'slightly-out-of-tune') return 'status-slightly-out';
  if (status === 'out-of-tune') return 'status-out-of-tune';
  return 'status-pending';
}

function confidenceRank(confidence: CertificationConfidence): number {
  if (confidence === 'high') return 4;
  if (confidence === 'medium') return 3;
  if (confidence === 'low') return 2;
  return 1;
}

export function getCertificationReportStats(
  aggregates: CertificationNoteAggregate[],
): CertificationReportStats {
  const notesMeasured = aggregates.filter((aggregate) => aggregate.strikeCount > 0);
  const noteStatuses = notesMeasured.map(getCertificationNoteStatus);
  const measuredValues = notesMeasured
    .flatMap((aggregate) => [aggregate.fundamental, aggregate.octave, aggregate.compoundFifth])
    .filter((component) => component.status === 'measured' && typeof component.cents === 'number')
    .map((component) => Math.abs(component.cents as number));

  const expectedComponents = notesMeasured.flatMap((aggregate) => getExpectedComponents(aggregate));
  const measuredExpectedComponents = expectedComponents.filter(
    (component) => component.status === 'measured',
  ).length;

  const highConfidence = notesMeasured.filter(
    (aggregate) => confidenceRank(aggregate.overallConfidence) >= confidenceRank('high'),
  ).length;

  const inconclusiveComponents = expectedComponents.filter(
    (component) => component.status === 'inconclusive',
  ).length;

  const notExpectedComponents = notesMeasured.reduce((count, aggregate) => {
    return count + [aggregate.octave, aggregate.compoundFifth].filter(
      (component) => component.status === 'not-expected',
    ).length;
  }, 0);

  const inTuneNotes = noteStatuses.filter((status) => status === 'in-tune').length;
  const slightlyOutNotes = noteStatuses.filter(
    (status) => status === 'slightly-out-of-tune',
  ).length;
  const outOfTuneNotes = noteStatuses.filter((status) => status === 'out-of-tune').length;
  const notesNeedingAttention = noteStatuses.filter(
    (status) => status === 'slightly-out-of-tune' || status === 'out-of-tune',
  ).length;

  const healthScore = measuredValues.length
    ? Math.round((measuredValues.filter((value) => value <= 12).length / measuredValues.length) * 100)
    : 0;

  return {
    notesMeasured: notesMeasured.length,
    highConfidence,
    inconclusiveComponents,
    notExpectedComponents,
    inTuneNotes,
    slightlyOutNotes,
    outOfTuneNotes,
    notesNeedingAttention,
    certifiedExpectedComponents: expectedComponents.length,
    measuredExpectedComponents,
    healthScore,
  };
}

export function getCertificationVerdict(
  stats: CertificationReportStats,
): CertificationVerdict {
  if (stats.outOfTuneNotes > 0) {
    return {
      label: 'This handpan needs tuning attention',
      badge: '⚠️',
      className: 'verdict-bad',
      subtitle:
        stats.inconclusiveComponents > 0
          ? `${stats.outOfTuneNotes} note${stats.outOfTuneNotes === 1 ? '' : 's'} are out of tune, and ${stats.inconclusiveComponents} expected partial${stats.inconclusiveComponents === 1 ? '' : 's'} still need a clearer certification pass.`
          : `${stats.outOfTuneNotes} note${stats.outOfTuneNotes === 1 ? '' : 's'} show tuning issues beyond the preferred range.`,
    };
  }

  if (stats.slightlyOutNotes > 0) {
    return {
      label: 'This handpan sounds good with room for fine tuning',
      badge: '✅',
      className: 'verdict-warn',
      subtitle:
        stats.inconclusiveComponents > 0
          ? `${stats.slightlyOutNotes} note${stats.slightlyOutNotes === 1 ? '' : 's'} are slightly out, and ${stats.inconclusiveComponents} expected partial${stats.inconclusiveComponents === 1 ? '' : 's'} remain inconclusive.`
          : `${stats.slightlyOutNotes} note${stats.slightlyOutNotes === 1 ? '' : 's'} are slightly outside the preferred range.`,
    };
  }

  if (stats.inconclusiveComponents > 0) {
    return {
      label: 'Measured components look in tune, but the certification is incomplete',
      badge: 'ℹ️',
      className: 'verdict-warn',
      subtitle: `${stats.inconclusiveComponents} expected partial${stats.inconclusiveComponents === 1 ? '' : 's'} still need a stronger multi-strike confirmation before the report is fully certified.`,
    };
  }

  return {
    label: 'This handpan is in tune',
    badge: '✅',
    className: 'verdict-good',
    subtitle: 'All expected components that were measured in the certified report are within the preferred tuning range.',
  };
}
