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

// dB window for sub-harmonic redirect: prefer the lower-frequency candidate when it is
// within this many dB of the YIN-detected frequency. 9 dB gives more aggressive octave
// correction than the previous 6 dB, catching decay-phase frames where the fundamental
// is moderately weaker than its second harmonic in the FFT spectrum.
const SUB_HARMONIC_DB_WINDOW = 9;

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
  if (peakMag < -65) return null;

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
 * Validates whether a YIN-detected frequency is the true fundamental or a harmonic alias.
 *
 * Checks if a sub-octave (f/2) has a comparable FFT peak. If so, the lower
 * frequency is likely the true fundamental (YIN locked onto the 2nd harmonic).
 *
 * @param detectedFreq - Frequency detected by YIN (Hz)
 * @param freqData - Float32Array of dB values from AnalyserNode.getFloatFrequencyData()
 * @param sampleRate - Audio sample rate (Hz)
 * @param fftSize - FFT size used by the AnalyserNode
 * @returns Corrected fundamental frequency in Hz, or null if the candidate has no harmonic family
 */
export function validateFundamental(
  detectedFreq: number,
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number
): number | null {
  const binHz = sampleRate / fftSize;

  function getMagnitudeAt(freq: number): number {
    const bin = freq / binHz;
    const lo = Math.floor(bin);
    const hi = lo + 1;
    if (lo < 0 || hi >= freqData.length) return -Infinity;
    // Linear interpolation between adjacent bins
    return freqData[lo] + (freqData[hi] - freqData[lo]) * (bin - lo);
  }

  const currentMag = getMagnitudeAt(detectedFreq);

  // Check sub-third (f/3) FIRST — YIN can lock onto the 3rd harmonic on complex tones
  // (e.g. playing D3 at 147 Hz but YIN detects its 3rd harmonic A4 at 440 Hz, or
  // playing C4 at 261 Hz but YIN detects its compound-fifth G5 at 784 Hz).
  // Checking f/3 before f/2 ensures that when both f/3 (true fundamental) and f/2
  // (sub-octave, which may be a real handpan note with its own FFT peak) are within
  // the dB window, we prefer the lower (more likely true) fundamental.
  const subThird = detectedFreq / 3;
  if (subThird >= 55) {
    const subThirdPeak = findHarmonicFrequency(freqData, subThird, sampleRate, fftSize);
    if (subThirdPeak !== null) {
      const subThirdMag = getMagnitudeAt(subThirdPeak);
      // If the sub-third is within SUB_HARMONIC_DB_WINDOW dB of the detected frequency, prefer it as the fundamental.
      // Using the same window as the f/2 check keeps the bar high enough to reject
      // false positives from low-frequency environmental noise near f/3.
      if (subThirdMag >= currentMag - SUB_HARMONIC_DB_WINDOW) {
        return subThirdPeak;
      }
    }
  }

  // Check sub-octave (f/2) — YIN can lock onto the 2nd harmonic (e.g. C4 playing
  // but YIN detects C5). Only reached when f/3 did not match, so we never prefer
  // the sub-octave when the sub-third (true fundamental) is also present.
  const subOctave = detectedFreq / 2;
  if (subOctave >= 55) {
    const subOctavePeak = findHarmonicFrequency(freqData, subOctave, sampleRate, fftSize);
    if (subOctavePeak !== null) {
      const subMag = getMagnitudeAt(subOctavePeak);
      // If sub-octave is within SUB_HARMONIC_DB_WINDOW dB of detected frequency, prefer the lower fundamental
      if (subMag >= currentMag - SUB_HARMONIC_DB_WINDOW) {
        return subOctavePeak;
      }
    }
  }

  // No harmonic redirect triggered. Refine the raw YIN frequency with FFT parabolic
  // interpolation before returning, for sub-cent accuracy on steady-state sustain tones.
  // The f/2 and f/3 redirect paths already return FFT-interpolated peaks (subOctavePeak /
  // subThirdPeak); applying the same treatment here makes all paths consistent and
  // eliminates the ~5–10¢ systematic bias that arises from YIN's tau-domain interpolation
  // when used without this final refinement step.
  const candidate = findHarmonicFrequency(freqData, detectedFreq, sampleRate, fftSize) ?? detectedFreq;

  return candidate;
}

/**
 * Calculates cents deviation of a detected frequency from a reference frequency.
 * Returns null if detectedFreq is null.
 */
export function calcCents(detectedFreq: number | null, referenceFreq: number): number | null {
  if (detectedFreq === null || detectedFreq <= 0 || referenceFreq <= 0) return null;
  return 1200 * Math.log2(detectedFreq / referenceFreq);
}
