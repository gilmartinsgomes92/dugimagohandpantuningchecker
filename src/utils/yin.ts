/**
 * YIN pitch detection algorithm
 * Based on: de Cheveigné, A. & Kawahara, H. (2002). YIN, a fundamental frequency estimator
 * for speech and music. Journal of the Acoustical Society of America, 111(4), 1917-1930.
 *
 * This is one of the most accurate algorithms for monophonic pitch detection,
 * capable of sub-cent accuracy with proper parabolic interpolation.
 */

const DEFAULT_THRESHOLD = 0.06;

/**
 * Detects the fundamental frequency of the input buffer using the YIN algorithm.
 * @param buffer - Float32Array of time-domain audio samples
 * @param sampleRate - Audio sample rate in Hz
 * @param threshold - YIN threshold (lower = more accurate but more octave errors, default 0.05)
 * @returns Fundamental frequency in Hz, or null if not detected
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  threshold: number = DEFAULT_THRESHOLD
): number | null {
  const bufferSize = buffer.length;
  const halfSize = Math.floor(bufferSize / 2);

  const yinBuffer = new Float32Array(halfSize);

  // Step 1 & 2: Compute difference function and cumulative mean normalized difference function
  yinBuffer[0] = 1.0;
  let runningSum = 0.0;

  for (let tau = 1; tau < halfSize; tau++) {
    let diff = 0.0;
    for (let j = 0; j < halfSize; j++) {
      const delta = buffer[j] - buffer[j + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    // CMNDF: d'(tau) = d(tau) / ((1/tau) * sum(d(j), j=1..tau))
    yinBuffer[tau] = diff * tau / runningSum;
  }

  // Step 3: Absolute threshold - find first minimum below threshold
  let tauEstimate = -1;
  for (let tau = 2; tau < halfSize; tau++) {
    if (yinBuffer[tau] < threshold) {
      // Keep going while still descending to find local minimum
      while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Step 4: Parabolic interpolation for sub-sample accuracy
  const betterTau = parabolicInterpolation(yinBuffer, tauEstimate, halfSize);

  // Sanity check: frequency should be in a reasonable musical range
  const frequency = sampleRate / betterTau;
  if (frequency < 55 || frequency > 4200) return null;

  return frequency;
}

/**
 * Parabolic interpolation around a minimum in an array.
 * Returns the refined position (can be fractional).
 */
function parabolicInterpolation(arr: Float32Array, pos: number, size: number): number {
  const x0 = pos > 0 ? pos - 1 : pos;
  const x2 = pos + 1 < size ? pos + 1 : pos;

  if (x0 === pos) {
    return arr[pos] <= arr[x2] ? pos : x2;
  }
  if (x2 === pos) {
    return arr[pos] <= arr[x0] ? pos : x0;
  }

  const s0 = arr[x0];
  const s1 = arr[pos];
  const s2 = arr[x2];

  // Vertex of the parabola
  return pos + (s2 - s0) / (2.0 * (2.0 * s1 - s2 - s0));
}

/**
 * Compute RMS energy of a buffer (used to gate pitch detection on silence).
 */
export function computeRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}
