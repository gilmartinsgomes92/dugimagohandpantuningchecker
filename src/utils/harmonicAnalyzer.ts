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
const NOISE_FLOOR_DB = -65; // Peaks below this dB level are treated as silence
const FORWARD_CONFIRM_DB = 24; // Harmonic must be within this many dB of candidate

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
  if (peakMag < NOISE_FLOOR_DB) return null;

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
 * Scans the FFT spectrum for the strongest peak in the handpan fundamental range
 * (55–1200 Hz) whose octave (2×) is also confirmed present.
 *
 * Used as a fallback when the primary YIN-based detection is rejected by the forward
 * harmonic check (e.g. when YIN locks onto a false harmonic alias whose overtones are
 * absent from the spectrum, such as C#4 when F4 is playing).
 *
 * @returns Confirmed fundamental frequency in Hz, or null if none found.
 */
function findConfirmedFundamental(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number
): number | null {
  const binHz = sampleRate / fftSize;
  const numBins = freqData.length;
  const minBin = Math.max(2, Math.floor(55 / binHz));
  const maxBin = Math.min(numBins - 2, Math.ceil(1200 / binHz));

  let bestFreq: number | null = null;
  let bestMag = -Infinity;

  for (let b = minBin; b <= maxBin; b++) {
    // Only local maxima above the noise floor
    if (freqData[b] < NOISE_FLOOR_DB) continue;
    if (freqData[b] < freqData[b - 1] || freqData[b] < freqData[b + 1]) continue;

    // Sub-bin refinement via parabolic interpolation
    const prev = freqData[b - 1];
    const next = freqData[b + 1];
    const denom = 2.0 * freqData[b] - prev - next;
    let delta = 0;
    if (Math.abs(denom) > 1e-6) {
      delta = 0.5 * (next - prev) / denom;
      delta = Math.max(-0.5, Math.min(0.5, delta));
    }
    const freq = (b + delta) * binHz;

    // Require a confirmed octave (2×) to rule out isolated noise peaks
    const octPeak = findHarmonicFrequency(freqData, freq * 2, sampleRate, fftSize);
    if (octPeak === null) continue;

    // Take the peak with the highest magnitude that passes the octave check
    if (freqData[b] > bestMag) {
      bestMag = freqData[b];
      bestFreq = freq;
    }
  }

  return bestFreq;
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

  // Check sub-octave (f/2) — the most common harmonic confusion.
  // The threshold is kept at 3 dB (rather than a wider window) to avoid falsely
  // redirecting to a sympathetically-resonating lower note. When YIN makes a genuine
  // octave error (detects 2f instead of f), the true fundamental is typically louder
  // than or very close in level to the detected overtone, so 3 dB is sufficient.
  const subOctave = detectedFreq / 2;
  if (subOctave >= 55) {
    const subOctavePeak = findHarmonicFrequency(freqData, subOctave, sampleRate, fftSize);
    if (subOctavePeak !== null) {
      const subMag = getMagnitudeAt(subOctavePeak);
      if (subMag >= currentMag - 3) {
        return subOctavePeak;
      }
    }
  }

  // Check sub-third (f/3) — YIN can lock onto the 3rd harmonic on complex tones
  // (e.g. playing D3 at 147 Hz but YIN detects its 3rd harmonic A4 at 440 Hz).
  // Same 3 dB threshold as the sub-octave check for consistency.
  const subThird = detectedFreq / 3;
  if (subThird >= 55) {
    const subThirdPeak = findHarmonicFrequency(freqData, subThird, sampleRate, fftSize);
    if (subThirdPeak !== null) {
      const subThirdMag = getMagnitudeAt(subThirdPeak);
      if (subThirdMag >= currentMag - 3) {
        return subThirdPeak;
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
  const candidateMag = getMagnitudeAt(candidate);

  // Forward harmonic check: confirm the candidate frequency has at least one tuned overtone
  // in the FFT. Every genuine handpan fundamental has its octave (2f) and/or compound fifth
  // (3f) purposely tuned by the maker and clearly audible in the spectrum. If neither partial
  // is within 24 dB of the candidate, this detection has no harmonic family evidence — it is
  // a false pick caused by sympathetic resonance, room noise, or a YIN lag-domain artefact
  // (e.g. YIN locking onto C#4 when F4 is playing, because C#4's overtones at 554 Hz and
  // 831 Hz are absent while F4's octave at 698 Hz is clearly present).
  const octaveCheck = findHarmonicFrequency(freqData, candidate * 2, sampleRate, fftSize);
  const cfifthCheck = findHarmonicFrequency(freqData, candidate * 3, sampleRate, fftSize);
  const octaveMag = octaveCheck !== null ? getMagnitudeAt(octaveCheck) : -Infinity;
  const cfifthMag = cfifthCheck !== null ? getMagnitudeAt(cfifthCheck) : -Infinity;
  if (octaveMag < candidateMag - FORWARD_CONFIRM_DB && cfifthMag < candidateMag - FORWARD_CONFIRM_DB) {
    // The YIN candidate has no confirmed harmonic family — it is an orphaned detection.
    // Fall back to a direct FFT scan: find the strongest peak in the handpan fundamental
    // range (55–1200 Hz) whose octave is confirmed present. This recovers cases where YIN
    // misidentifies the pitch (e.g. C#4 when F4 is playing) that the forward check
    // correctly rejects, but without losing the actual note being played.
    return findConfirmedFundamental(freqData, sampleRate, fftSize);
  }

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
