/**
 * TypeScript interfaces for the handpan tuning checker data model.
 */

export interface FrequencyReading {
  frequency: number;
  deviation: number; // in cents
  confidence: number; // 0-1
}

export interface TuningMeasurement {
  timestamp: Date;
  handpan: string; // instrument identifier
  note: string; // e.g., "D3"
  fundamental: FrequencyReading;
  octave: FrequencyReading;
  fifth: FrequencyReading;
}

export interface TuningSession {
  id: string;
  date: Date;
  measurements: TuningMeasurement[];
}
