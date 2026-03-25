export type CertificationComponentStatus = 'measured' | 'inconclusive' | 'not-expected';
export type CertificationConfidence = 'high' | 'medium' | 'low' | 'uncertain';

export interface ExpectedPartials {
  octave: boolean;
  compoundFifth: boolean;
}

export interface CertificationStrike {
  noteName: string;
  targetFrequency: number;
  detectedFrequency: number | null;
  cents: number | null;
  octaveFrequency: number | null;
  octaveCents: number | null;
  compoundFifthFrequency: number | null;
  compoundFifthCents: number | null;
  capturedAt: number;
}

export interface AggregatedComponentResult {
  status: CertificationComponentStatus;
  cents: number | null;
  spreadCents: number | null;
  validStrikeCount: number;
  confidence: CertificationConfidence;
}

export interface CertificationNoteAggregate {
  noteName: string;
  strikeCount: number;
  strikes: CertificationStrike[];
  expectations: ExpectedPartials;
  fundamental: AggregatedComponentResult;
  octave: AggregatedComponentResult;
  compoundFifth: AggregatedComponentResult;
  overallConfidence: CertificationConfidence;
}
