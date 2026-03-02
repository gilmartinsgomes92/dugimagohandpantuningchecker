/**
 * Narrow-band pitch detection utility.
 *
 * Performs high-accuracy frequency detection constrained to a narrow frequency
 * window [searchLoHz, searchHiHz]. Intended for the precision measurement phase
 * (Step 2) of the 2-step tuning workflow.
 *
 * Algorithm:
 *  1. RMS noise floor gate – return null for near-silent signals
 *  2. Hann-windowed radix-2 FFT of the input buffer
 *  3. Convert Hz search bounds to FFT bin indices
 *  4. Find the highest-magnitude bin within the window
 *  5. Parabolic interpolation for sub-bin (≈ ±1¢) frequency accuracy
 */

import { computeRMS } from './yin';

const FFT_SIZE = 4096;
const NOISE_FLOOR_RMS = 0.005;
const NOISE_FLOOR_DB = -65;

/**
 * Detects the dominant frequency within a restricted frequency window using
 * FFT-based peak finding with parabolic interpolation for sub-bin accuracy.
 *
 * @param buffer      - Float32Array of time-domain audio samples
 * @param sampleRate  - Audio sample rate in Hz
 * @param searchLoHz  - Lower bound of search window in Hz
 * @param searchHiHz  - Upper bound of search window in Hz
 * @returns Detected frequency in Hz, or null if no significant signal found
 */
export function detectPitchInWindow(
  buffer: Float32Array,
  sampleRate: number,
  searchLoHz: number,
  searchHiHz: number
): number | null {
  // Noise floor gate: reject silent or near-silent signals
  if (computeRMS(buffer) < NOISE_FLOOR_RMS) return null;

  const fftSize = FFT_SIZE;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const len = Math.min(buffer.length, fftSize);

  // Apply Hann window to reduce spectral leakage
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    re[i] = buffer[i] * w;
  }

  radix2FFT(re, im, fftSize);

  // Build dB magnitude spectrum (first numBins = fftSize/2)
  const numBins = fftSize / 2;
  const magDB = new Float32Array(numBins);
  for (let k = 0; k < numBins; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / fftSize;
    magDB[k] = mag > 1e-12 ? 20 * Math.log10(mag) : -Infinity;
  }

  // Convert search window bounds to bin indices
  const binHz = sampleRate / fftSize;
  const lowBin = Math.max(1, Math.floor(searchLoHz / binHz));
  const highBin = Math.min(numBins - 2, Math.ceil(searchHiHz / binHz));

  if (lowBin >= highBin) return null;

  // Find peak magnitude bin within the window
  let peakBin = lowBin;
  let peakMag = magDB[lowBin];
  for (let k = lowBin + 1; k <= highBin; k++) {
    if (magDB[k] > peakMag) {
      peakMag = magDB[k];
      peakBin = k;
    }
  }

  // Reject if peak is below noise floor
  if (peakMag < NOISE_FLOOR_DB) return null;

  // Parabolic interpolation for sub-bin accuracy
  const prevMag = magDB[peakBin - 1];
  const nextMag = magDB[peakBin + 1];
  const denom = 2.0 * peakMag - prevMag - nextMag;
  let delta = 0;
  if (Math.abs(denom) > 1e-6) {
    delta = 0.5 * (nextMag - prevMag) / denom;
    delta = Math.max(-0.5, Math.min(0.5, delta));
  }

  return (peakBin + delta) * binHz;
}

/**
 * Iterative Cooley-Tukey radix-2 in-place FFT.
 * Modifies re and im arrays in place.
 * @param re - Real part array (input/output), length must be a power of 2
 * @param im - Imaginary part array (input/output), initialised to zero
 * @param n  - FFT size (power of 2)
 */
function radix2FFT(re: Float64Array, im: Float64Array, n: number): void {
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1.0;
      let curIm = 0.0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}
