/**
 * Types shared across the handpan tuner application.
 */

export interface HarmonicInfo {
  /** Detected frequency in Hz (null = not detected) */
  frequency: number | null;
  /** Cents deviation from the ideal reference (null = not available) */
  cents: number | null;
}

/** Real-time signal and detection quality metrics */
export interface DetectionQuality {
  /** YIN algorithm confidence (0–100): how clearly below threshold the CMNDF minimum dipped */
  yinConfidence: number;
  /** Normalised RMS signal strength (0–100) */
  signalStrength: number;
  /** Combined overall quality score (0–100) */
  overallScore: number;
}

/** Verified snapshot captured at ~1 second into a note */
export interface ReadingSnapshot {
  /** Wall-clock timestamp (ms since epoch) */
  timestamp: number;
  /** Seconds elapsed since note onset when snapshot was taken */
  noteAge: number;
  /** Detected note name (e.g. "D3") */
  noteName: string;
  /** Fundamental frequency in Hz */
  frequency: number;
  /** Cents deviation of fundamental from nearest equal-temperament semitone */
  fundamentalCents: number;
  /** Cents deviation of octave from ideal 2:1 ratio (null if undetected) */
  octaveCents: number | null;
  /** Cents deviation of compound fifth from ideal 3:1 ratio (null if undetected) */
  compoundFifthCents: number | null;
  /** Raw RMS level at snapshot time */
  rms: number;
  /** YIN confidence at snapshot time (0–100) */
  yinConfidence: number;
  /** Overall quality score at snapshot time (0–100) */
  quality: number;
}

export interface TunerData {
  /** Fundamental pitch detection result */
  fundamental: HarmonicInfo & {
    /** Detected note name (e.g. "D4") */
    noteName: string | null;
    /** Expected frequency of the nearest semitone (target for 0¢) */
    targetFrequency: number | null;
  };
  /** Octave: should be exactly 2× the fundamental */
  octave: HarmonicInfo;
  /** Compound fifth: should be exactly 3× the fundamental (just intonation P12) */
  compoundFifth: HarmonicInfo;
  /** Whether signal energy is sufficient for detection */
  hasSignal: boolean;
  /** Real-time detection quality metrics (null when no signal) */
  quality: DetectionQuality | null;
}

export interface AudioConfig {
  sampleRate: number;
  fftSize: number;
  bufferSize: number;
}
