/**
 * FFT-based harmonic frequency analyzer.
 *
 * Uses the Web Audio API AnalyserNode's FFT output and parabolic interpolation
 * to accurately locate harmonic frequencies (octave at 2x, compound fifth at 3x
 * the fundamental).
 *
 * Parabolic interpolation around the FFT peak gives sub-bin frequency resolution
 * of approximately ±0.1–0.3 Hz at 44100 Hz / 32768 bin FFT, translating to
 * sub-cent accuracy for handpan fundamentals (D3–C6).
 */

const SEARCH_CENTS = 80; // Search window in cents around expected harmonic

/**
 * Converts cents above/below a reference frequency to the maximum frequency offset.
 */
function centsToFrequencyRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/**
 * Finds the most prominent frequency peak in the FFT magnitude spectrum
 * within a search window centered on `targetFreq`.
 *
 * @param freqData - Float32Array of dB values from AnalyserNode.getFloatFrequencyData()
 * @param targetFreq - The expected frequency to search around (Hz)
 * @param sampleRate - Audio sample rate (Hz)
 * @param fftSize - FFT size (number of bins × 2, since freqData.length = fftSize/2)
 * @returns Detected frequency in Hz, or null if no significant peak found
 */
export function findHarmonicFrequency(
  freqData: Float32Array,
  targetFreq: number,
  sampleRate: number,
  fftSize: number
): number | null {
  const binHz = sampleRate / fftSize;
  const numBins = freqData.length; // = fftSize / 2

  // Calculate search range in bins
  const lowFreq = targetFreq / centsToFrequencyRatio(SEARCH_CENTS);
  const highFreq = targetFreq * centsToFrequencyRatio(SEARCH_CENTS);

  const lowBin = Math.max(1, Math.floor(lowFreq / binHz));
  const highBin = Math.min(numBins - 2, Math.ceil(highFreq / binHz));

  if (lowBin >= highBin) return null;

  // Find the peak bin in the search range
  let peakBin = lowBin;
  let peakMag = freqData[lowBin];

  for (let k = lowBin + 1; k <= highBin; k++) {
    if (freqData[k] > peakMag) {
      peakMag = freqData[k];
      peakBin = k;
    }
  }

  // Reject if the peak is below noise floor (-60 dB is typical silence)
  if (peakMag < -55) return null;

  // Parabolic interpolation for sub-bin accuracy
  const prevMag = freqData[peakBin - 1];
  const nextMag = freqData[peakBin + 1];

  const denom = 2.0 * peakMag - prevMag - nextMag;
  let delta = 0;
  if (Math.abs(denom) > 1e-6) {
    delta = 0.5 * (nextMag - prevMag) / denom;
    // Clamp delta to [-0.5, 0.5] (within one bin)
    delta = Math.max(-0.5, Math.min(0.5, delta));
  }

  return (peakBin + delta) * binHz;
}

/**
 * Calculates cents deviation of a detected frequency from a reference frequency.
 * Returns null if detectedFreq is null.
 */
export function calcCents(detectedFreq: number | null, referenceFreq: number): number | null {
  if (detectedFreq === null || detectedFreq <= 0 || referenceFreq <= 0) return null;
  return 1200 * Math.log2(detectedFreq / referenceFreq);
}
