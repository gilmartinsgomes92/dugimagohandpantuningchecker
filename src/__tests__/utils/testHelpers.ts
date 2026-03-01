/**
 * Test helper utilities for audio algorithm testing.
 *
 * Provides synthetic signal generators and accuracy metric functions
 * used across unit and integration tests.
 */

/**
 * Generates a synthetic mono sine-wave buffer at a given frequency.
 *
 * @param frequency - Frequency in Hz
 * @param sampleRate - Sample rate in Hz (default 44100)
 * @param numSamples - Number of samples to generate (default 4096)
 * @param amplitude - Peak amplitude 0–1 (default 0.5)
 * @param phaseOffset - Initial phase in radians (default 0)
 */
export function generateSineWave(
  frequency: number,
  sampleRate: number = 44100,
  numSamples: number = 4096,
  amplitude: number = 0.5,
  phaseOffset: number = 0
): Float32Array {
  const buffer = new Float32Array(numSamples);
  const angularFreq = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < numSamples; i++) {
    buffer[i] = amplitude * Math.sin(angularFreq * i + phaseOffset);
  }
  return buffer;
}

/**
 * Generates a complex signal containing a fundamental plus its octave (2x)
 * and compound fifth (3x) harmonics, mimicking a real handpan tone.
 *
 * @param fundamental - Fundamental frequency in Hz
 * @param sampleRate - Sample rate in Hz
 * @param numSamples - Number of samples
 * @param amplitudes - Relative amplitudes [fundamental, 2x, 3x] (default [1, 0.5, 0.25])
 */
export function generateHarmonicSignal(
  fundamental: number,
  sampleRate: number = 44100,
  numSamples: number = 4096,
  amplitudes: [number, number, number] = [1.0, 0.5, 0.25]
): Float32Array {
  const buffer = new Float32Array(numSamples);
  const freqs = [fundamental, fundamental * 2, fundamental * 3];
  for (let h = 0; h < 3; h++) {
    const angularFreq = (2 * Math.PI * freqs[h]) / sampleRate;
    const amp = amplitudes[h];
    for (let i = 0; i < numSamples; i++) {
      buffer[i] += amp * Math.sin(angularFreq * i);
    }
  }
  // Normalize so the peak value is ≤ 1.0
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    if (Math.abs(buffer[i]) > peak) peak = Math.abs(buffer[i]);
  }
  if (peak > 0) {
    for (let i = 0; i < numSamples; i++) {
      buffer[i] /= peak;
    }
  }
  return buffer;
}

/**
 * Converts a time-domain buffer into a log-magnitude FFT spectrum (dB values)
 * that matches the format produced by AnalyserNode.getFloatFrequencyData().
 *
 * Uses a Hann-windowed Cooley-Tukey radix-2 FFT for O(N log N) performance
 * and accurate spectral peak positions via parabolic interpolation.
 *
 * @param timeBuffer - Time-domain Float32Array
 * @param fftSize - FFT size (must be a power of 2 and equal to timeBuffer.length)
 * @returns Float32Array of length fftSize/2 containing dB magnitudes
 */
export function computeFFTMagnitudeDB(
  timeBuffer: Float32Array,
  fftSize: number
): Float32Array {
  const numBins = fftSize / 2;

  // Apply Hann window to reduce spectral leakage
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    re[i] = timeBuffer[i] * w;
  }

  // Cooley-Tukey radix-2 in-place FFT
  radix2FFT(re, im, fftSize);

  // Convert complex spectrum to dB magnitudes (first numBins = fftSize/2)
  const magDB = new Float32Array(numBins);
  for (let k = 0; k < numBins; k++) {
    const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / fftSize;
    magDB[k] = magnitude > 1e-12 ? 20 * Math.log10(magnitude) : -Infinity;
  }
  return magDB;
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

/**
 * Computes the absolute cents deviation between a detected frequency
 * and a reference frequency.
 *
 * @param detectedFreq - Detected frequency in Hz
 * @param referenceFreq - Reference (ground-truth) frequency in Hz
 * @returns Absolute deviation in cents
 */
export function centDeviation(detectedFreq: number, referenceFreq: number): number {
  return Math.abs(1200 * Math.log2(detectedFreq / referenceFreq));
}

/**
 * Computes the signed cents deviation (positive = sharp, negative = flat).
 */
export function signedCentsDeviation(detectedFreq: number, referenceFreq: number): number {
  return 1200 * Math.log2(detectedFreq / referenceFreq);
}

/**
 * Runs pitch detection over an array of test cases and returns the success rate.
 *
 * @param testCases - Array of { frequency, signal } objects
 * @param detector - Function that takes a Float32Array buffer and returns Hz | null
 * @param toleranceCents - Maximum acceptable deviation in cents
 * @returns Fraction of test cases within tolerance (0–1)
 */
export function computeDetectionSuccessRate(
  testCases: Array<{ frequency: number; signal: Float32Array }>,
  detector: (buf: Float32Array) => number | null,
  toleranceCents: number
): number {
  let successes = 0;
  for (const { frequency, signal } of testCases) {
    const detected = detector(signal);
    if (detected !== null && centDeviation(detected, frequency) <= toleranceCents) {
      successes++;
    }
  }
  return successes / testCases.length;
}

/**
 * Builds a test matrix of { frequency, signal } pairs for a given list of
 * frequencies across multiple amplitude levels.
 *
 * @param frequencies - Array of frequencies in Hz to test
 * @param sampleRate - Sample rate in Hz
 * @param amplitudes - Array of amplitude levels to test (default [0.5, 0.2, 0.05])
 */
export function buildTestMatrix(
  frequencies: number[],
  sampleRate: number = 44100,
  amplitudes: number[] = [0.5, 0.2, 0.05]
): Array<{ frequency: number; amplitude: number; signal: Float32Array }> {
  const matrix: Array<{ frequency: number; amplitude: number; signal: Float32Array }> = [];
  for (const freq of frequencies) {
    for (const amp of amplitudes) {
      matrix.push({
        frequency: freq,
        amplitude: amp,
        signal: generateSineWave(freq, sampleRate, 4096, amp),
      });
    }
  }
  return matrix;
}
