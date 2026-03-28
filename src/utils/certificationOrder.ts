import type { CertificationNoteAggregate } from "../types/certification";

export function certificationAggregateSortKey(aggregate: CertificationNoteAggregate): number {
  const strike = aggregate.strikes[0];
  if (!strike || !Number.isFinite(strike.targetFrequency)) return Number.POSITIVE_INFINITY;
  return strike.targetFrequency;
}

export function orderCertificationAggregates<T extends CertificationNoteAggregate>(aggregates: T[]): T[] {
  return [...aggregates].sort((a, b) => {
    const keyDiff = certificationAggregateSortKey(a) - certificationAggregateSortKey(b);
    if (keyDiff !== 0) return keyDiff;
    return a.noteName.localeCompare(b.noteName);
  });
}
