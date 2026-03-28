import type { CertificationNoteAggregate } from '../types/certification';
import type { CertificationReportStats, CertificationVerdict } from './certificationReportUtils';
import type {
  CertificationReportRecord,
  SerializableCertificationNoteAggregate,
} from '../types/reportRegistry';

const APP_VERSION = 'v43';

function toSerializableAggregate(
  aggregate: CertificationNoteAggregate,
): SerializableCertificationNoteAggregate {
  return {
    ...aggregate,
    strikes: aggregate.strikes.map((strike) => ({ ...strike })),
    expectations: { ...aggregate.expectations },
    fundamental: { ...aggregate.fundamental },
    octave: { ...aggregate.octave },
    compoundFifth: { ...aggregate.compoundFifth },
  };
}

export function createCertificationReportRecord(params: {
  verificationId: string;
  aggregates: CertificationNoteAggregate[];
  stats: CertificationReportStats;
  verdict: CertificationVerdict;
  createdAt?: string;
}): CertificationReportRecord {
  const { verificationId, aggregates, stats, verdict, createdAt = new Date().toISOString() } = params;

  return {
    verificationId,
    createdAt,
    noteCount: aggregates.length,
    aggregates: aggregates.map(toSerializableAggregate),
    stats,
    verdict,
    appVersion: APP_VERSION,
  };
}

export async function saveCertificationReport(record: CertificationReportRecord): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('/api/reports/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { ok: false, error: payload?.error ?? 'Could not save certified report.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error while saving certified report.' };
  }
}

export async function fetchCertificationReport(verificationId: string): Promise<{ ok: boolean; report?: CertificationReportRecord; error?: string }> {
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(verificationId)}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: payload?.error ?? 'Could not load report.' };
    }

    return { ok: true, report: payload?.report as CertificationReportRecord };
  } catch {
    return { ok: false, error: 'Network error while loading report.' };
  }
}
