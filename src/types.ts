/**
 * Types shared across the handpan tuner application.
 */

export interface HarmonicInfo {
  /** Detected frequency in Hz (null = not detected) */
  frequency: number | null;
  /** Hz deviation from the ideal reference (null = not available) */
  hzDeviation: number | null;
}

export interface TunerData {
  /** Fundamental pitch detection result */
  fundamental: HarmonicInfo & {
    /** Detected note name (e.g. "D4") */
    noteName: string | null;
    /** Expected frequency of the nearest semitone (target for 0 Hz deviation) */
    targetFrequency: number | null;
  };
  /** Octave: should be exactly 2× the fundamental */
  octave: HarmonicInfo;
  /** Compound fifth: should be exactly 3× the fundamental (just intonation P12) */
  compoundFifth: HarmonicInfo;
  /** Whether signal energy is sufficient for detection */
  hasSignal: boolean;
}

export interface AudioConfig {
  sampleRate: number;
  fftSize: number;
  bufferSize: number;
}
