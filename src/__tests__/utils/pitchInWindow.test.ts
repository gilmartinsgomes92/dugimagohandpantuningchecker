/**
 * Unit tests for detectPitchInWindow – narrow-band FFT pitch detection.
 *
 * Validates:
 * - Sine wave inside window → correct frequency (sub-cent accuracy)
 * - Sine wave outside window → returns null
 * - Narrow window (±20 cents) around fundamental
 * - Octave (2×) and compound-fifth (3×) windows
 * - Below noise floor → returns null
 * - High-noise environment with target signal → correct frequency
 */

import { detectPitchInWindow } from '../../utils/pitchInWindow';
import {
  generateSineWave,
  generateHarmonicSignal,
  centDeviation,
} from './testHelpers';

const SAMPLE_RATE = 44100;

// ── Helper: add white noise to a buffer ──────────────────────────────────────

function addWhiteNoise(signal: Float32Array, noiseAmplitude: number): Float32Array {
  const out = new Float32Array(signal.length);
  // Deterministic pseudo-random noise for reproducibility
  let seed = 12345;
  for (let i = 0; i < signal.length; i++) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const noise = ((seed >>> 0) / 0xffffffff - 0.5) * 2 * noiseAmplitude;
    out[i] = signal[i] + noise;
  }
  return out;
}

// ── Sine wave inside window ───────────────────────────────────────────────────

describe('detectPitchInWindow – sine wave inside window', () => {
  it.each([
    { freq: 220.0,  name: 'A3' },
    { freq: 293.66, name: 'D4' },
    { freq: 440.0,  name: 'A4' },
    { freq: 523.25, name: 'C5' },
  ])(
    'detects $name ($freq Hz) within ±3 cents when inside the window',
    ({ freq }) => {
      const loHz = freq * Math.pow(2, -100 / 1200); // −100 cents
      const hiHz = freq * Math.pow(2, 100 / 1200);  // +100 cents
      const signal = generateSineWave(freq, SAMPLE_RATE, 4096, 0.5);
      const detected = detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, freq)).toBeLessThanOrEqual(3);
    }
  );
});

// ── Sine wave outside window → null ──────────────────────────────────────────

describe('detectPitchInWindow – sine wave outside window', () => {
  it('returns null when the signal frequency is below the search window', () => {
    const signalFreq = 220.0; // A3
    const loHz = 400.0;
    const hiHz = 500.0;
    const signal = generateSineWave(signalFreq, SAMPLE_RATE, 4096, 0.5);
    expect(detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz)).toBeNull();
  });

  it('returns null when the signal frequency is above the search window', () => {
    const signalFreq = 880.0; // A5
    const loHz = 400.0;
    const hiHz = 500.0;
    const signal = generateSineWave(signalFreq, SAMPLE_RATE, 4096, 0.5);
    expect(detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz)).toBeNull();
  });
});

// ── Narrow window ±20 cents around fundamental ────────────────────────────────

describe('detectPitchInWindow – narrow window (±20 cents)', () => {
  it.each([
    { freq: 293.66, name: 'D4' },
    { freq: 440.0,  name: 'A4' },
  ])(
    'detects $name ($freq Hz) within ±2 cents using a ±20-cent window',
    ({ freq }) => {
      const loHz = freq * Math.pow(2, -20 / 1200);
      const hiHz = freq * Math.pow(2, 20 / 1200);
      const signal = generateSineWave(freq, SAMPLE_RATE, 4096, 0.5);
      const detected = detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, freq)).toBeLessThanOrEqual(2);
    }
  );
});

// ── Octave window ─────────────────────────────────────────────────────────────

describe('detectPitchInWindow – octave window (2×)', () => {
  it.each([
    { fundamental: 146.83, name: 'D3' },
    { fundamental: 293.66, name: 'D4' },
    { fundamental: 440.0,  name: 'A4' },
  ])(
    'detects the octave of $name within ±2 cents',
    ({ fundamental }) => {
      const octave = fundamental * 2;
      const loHz = octave * Math.pow(2, -80 / 1200);
      const hiHz = octave * Math.pow(2, 80 / 1200);
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, 4096, [0.6, 1.0, 0]);
      const detected = detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, octave)).toBeLessThanOrEqual(2);
    }
  );
});

// ── Compound-fifth window (3×) ────────────────────────────────────────────────

describe('detectPitchInWindow – compound-fifth window (3×)', () => {
  it.each([
    { fundamental: 146.83, name: 'D3' },
    { fundamental: 293.66, name: 'D4' },
  ])(
    'detects the compound fifth of $name within ±5 cents',
    ({ fundamental }) => {
      const cfifth = fundamental * 3;
      const loHz = cfifth * Math.pow(2, -80 / 1200);
      const hiHz = cfifth * Math.pow(2, 80 / 1200);
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, 4096, [0.6, 0.4, 1.0]);
      const detected = detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, cfifth)).toBeLessThanOrEqual(5);
    }
  );
});

// ── Below noise floor → null ──────────────────────────────────────────────────

describe('detectPitchInWindow – noise floor rejection', () => {
  it('returns null for a near-silent signal (amplitude < noise floor)', () => {
    // RMS of amplitude=0.001 sine is well below the 0.005 threshold
    const signal = generateSineWave(440, SAMPLE_RATE, 4096, 0.001);
    const loHz = 400;
    const hiHz = 480;
    expect(detectPitchInWindow(signal, SAMPLE_RATE, loHz, hiHz)).toBeNull();
  });

  it('returns null for a silent (all-zero) buffer', () => {
    const signal = new Float32Array(4096);
    expect(detectPitchInWindow(signal, SAMPLE_RATE, 400, 480)).toBeNull();
  });
});

// ── High-noise environment + target signal ────────────────────────────────────

describe('detectPitchInWindow – noisy signal', () => {
  it('detects A4 (440 Hz) within ±3 cents when SNR is ~20 dB', () => {
    const freq = 440.0;
    const loHz = freq * Math.pow(2, -100 / 1200);
    const hiHz = freq * Math.pow(2, 100 / 1200);
    // Amplitude 0.5 signal + 0.05 white noise ≈ 20 dB SNR
    const cleanSignal = generateSineWave(freq, SAMPLE_RATE, 4096, 0.5);
    const noisySignal = addWhiteNoise(cleanSignal, 0.05);
    const detected = detectPitchInWindow(noisySignal, SAMPLE_RATE, loHz, hiHz);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, freq)).toBeLessThanOrEqual(3);
  });
});
