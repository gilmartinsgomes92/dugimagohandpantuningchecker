/**
 * PitchDetector service – fundamental frequency identification.
 *
 * Wraps the YIN algorithm and the FFT-based fundamental validation to
 * provide a clean service interface for pitch detection with confidence scoring.
 */

import { detectPitch, computeRMS } from '../../utils/yin';
import { validateFundamental } from '../../utils/harmonicAnalyzer';

/** Minimum RMS level required before attempting pitch detection. */
const RMS_THRESHOLD = 0.005;

export interface PitchResult {
  /** Detected fundamental frequency in Hz, or null if detection failed. */
  frequency: number | null;
  /** Confidence score 0–1 based on signal RMS and YIN CMNDF minimum. */
  confidence: number;
}

export class PitchDetector {
  private readonly sampleRate: number;
  private readonly fftSize: number;

  constructor(sampleRate: number, fftSize: number) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
  }

  /**
   * Detect the fundamental frequency from a time-domain buffer.
   * Uses YIN for pitch estimation and FFT-based harmonic validation
   * to correct octave errors common in handpan tones.
   *
   * @param timeDomain - Float32Array of time-domain audio samples
   * @param freqDomain - Float32Array of dB frequency magnitudes from AnalyserNode
   * @returns PitchResult with frequency and confidence
   */
  detect(timeDomain: Float32Array, freqDomain: Float32Array): PitchResult {
    const rms = computeRMS(timeDomain);
    if (rms < RMS_THRESHOLD) {
      return { frequency: null, confidence: 0 };
    }

    // Normalise RMS to a rough confidence proxy (clamp to 0–1)
    const confidence = Math.min(1, rms / 0.1);

    const rawFreq = detectPitch(timeDomain, this.sampleRate);
    if (rawFreq === null) {
      return { frequency: null, confidence: confidence * 0.3 };
    }

    const validated = validateFundamental(rawFreq, freqDomain, this.sampleRate, this.fftSize);
    return {
      frequency: validated,
      confidence: validated !== null ? confidence : 0,
    };
  }
}
