import type { CertificationNoteAggregate } from './certification';
import type { CertificationReportStats, CertificationVerdict } from '../utils/certificationReportUtils';

export type SerializableCertificationStrike = {
  noteName: string;
  targetFrequency: number;
  detectedFrequency: number | null;
  cents: number | null;
  octaveFrequency: number | null;
  octaveCents: number | null;
  compoundFifthFrequency: number | null;
  compoundFifthCents: number | null;
  capturedAt: number;
};

export type SerializableCertificationNoteAggregate = Omit<CertificationNoteAggregate, 'strikes'> & {
  strikes: SerializableCertificationStrike[];
};

export type CertificationReportRecord = {
  verificationId: string;
  createdAt: string;
  noteCount: number;
  aggregates: SerializableCertificationNoteAggregate[];
  stats: CertificationReportStats;
  verdict: CertificationVerdict;
  appVersion: string;
};

export type ReportLookupResponse = {
  ok: boolean;
  report?: CertificationReportRecord;
  error?: string;
};
