/**
 * FFTAnalyzer service – computes FFT peak detection on AnalyserNode output.
 *
 * Wraps findHarmonicFrequency from harmonicAnalyzer utility to provide a
 * service-oriented API for locating spectral peaks near target frequencies.
 */

import { findHarmonicFrequency } from '../../utils/harmonicAnalyzer';

export interface FFTPeak {
  /** Detected frequency in Hz, or null if no peak found above the noise floor. */
  frequency: number | null;
  /** Index of the closest bin to the detected frequency. */
  binIndex: number | null;
}

export class FFTAnalyzer {
  private readonly sampleRate: number;
  private readonly fftSize: number;

  constructor(sampleRate: number, fftSize: number) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
  }

  /**
   * Detect the frequency of a spectral peak closest to `targetFreq`.
   * Uses parabolic interpolation for sub-bin accuracy.
   *
   * @param freqData - Float32Array of dB values from AnalyserNode.getFloatFrequencyData()
   * @param targetFreq - Expected frequency to search around (Hz)
   * @returns FFTPeak with detected frequency or null if below noise floor
   */
  findPeak(freqData: Float32Array, targetFreq: number): FFTPeak {
    const frequency = findHarmonicFrequency(freqData, targetFreq, this.sampleRate, this.fftSize);
    const binHz = this.sampleRate / this.fftSize;
    const binIndex = frequency !== null ? Math.round(frequency / binHz) : null;
    return { frequency, binIndex };
  }

  /**
   * Returns the full magnitude spectrum as dB values (direct pass-through
   * of the AnalyserNode buffer, provided for visualisation consumers).
   */
  getSpectrum(freqData: Float32Array): Float32Array {
    return freqData;
  }
}
