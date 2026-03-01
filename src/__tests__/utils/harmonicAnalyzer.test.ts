/**
 * Unit tests for the FFT-based harmonic frequency analyzer.
 *
 * Validates:
 * - findHarmonicFrequency: peak detection within search window with parabolic interpolation
 * - calcCents: cents calculation helper
 * - Octave (2×) and compound-fifth (3×) accuracy within specified tolerances
 * - Rejection of silent / below-noise-floor signals
 */

import { findHarmonicFrequency, calcCents } from '../../utils/harmonicAnalyzer';
import { generateHarmonicSignal, computeFFTMagnitudeDB, centDeviation } from './testHelpers';
import { HANDPAN_REFERENCE_NOTES } from '../fixtures/handpanReferenceData';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

// ── calcCents ────────────────────────────────────────────────────────────────

describe('calcCents', () => {
  it('returns null when detectedFreq is null', () => {
    expect(calcCents(null, 440)).toBeNull();
  });

  it('returns null when detectedFreq is 0', () => {
    expect(calcCents(0, 440)).toBeNull();
  });

  it('returns null when referenceFreq is 0', () => {
    expect(calcCents(440, 0)).toBeNull();
  });

  it('returns 0 for identical frequencies', () => {
    expect(calcCents(440, 440)).toBeCloseTo(0, 4);
  });

  it('returns +1200 for an octave above', () => {
    expect(calcCents(880, 440)).toBeCloseTo(1200, 2);
  });

  it('returns -1200 for an octave below', () => {
    expect(calcCents(220, 440)).toBeCloseTo(-1200, 2);
  });
});

// ── findHarmonicFrequency – basic peak detection ─────────────────────────────

describe('findHarmonicFrequency – fundamental peak detection', () => {
  it('finds A4 (440 Hz) in a pure sine-wave FFT spectrum within ±5 cents', () => {
    const signal = generateHarmonicSignal(440, SAMPLE_RATE, FFT_SIZE, [1, 0, 0]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const detected = findHarmonicFrequency(freqData, 440, SAMPLE_RATE, FFT_SIZE);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, 440)).toBeLessThanOrEqual(5);
  });

  it('finds D4 (293.66 Hz) within ±5 cents', () => {
    const signal = generateHarmonicSignal(293.66, SAMPLE_RATE, FFT_SIZE, [1, 0, 0]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const detected = findHarmonicFrequency(freqData, 293.66, SAMPLE_RATE, FFT_SIZE);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, 293.66)).toBeLessThanOrEqual(5);
  });
});

// ── findHarmonicFrequency – octave (2×) accuracy ────────────────────────────

describe('findHarmonicFrequency – octave (2×) detection', () => {
  const OCTAVE_TOLERANCE_CENTS = 2;

  const notesToTest = HANDPAN_REFERENCE_NOTES.filter(n =>
    ['D3', 'D4', 'A4', 'C5', 'C6'].includes(n.fullName)
  );

  it.each(notesToTest)(
    'detects the octave of $fullName ($octave Hz) within ±2 cents',
    ({ fundamental, octave }) => {
      // Build a signal with only fundamental + octave
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [0.6, 1.0, 0]);
      const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
      const detected = findHarmonicFrequency(freqData, octave, SAMPLE_RATE, FFT_SIZE);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, octave)).toBeLessThanOrEqual(OCTAVE_TOLERANCE_CENTS);
    }
  );
});

// ── findHarmonicFrequency – compound fifth (3×) accuracy ────────────────────

describe('findHarmonicFrequency – compound fifth (3×) detection', () => {
  const CFIFTH_TOLERANCE_CENTS = 5;

  const notesToTest = HANDPAN_REFERENCE_NOTES.filter(n =>
    ['D3', 'D4', 'A4', 'C5'].includes(n.fullName)
  );

  it.each(notesToTest)(
    'detects the compound fifth of $fullName ($compoundFifth Hz) within ±5 cents',
    ({ fundamental, compoundFifth }) => {
      // Build a signal with fundamental + weak 2× + 3×
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [0.6, 0.4, 1.0]);
      const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
      const detected = findHarmonicFrequency(freqData, compoundFifth, SAMPLE_RATE, FFT_SIZE);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, compoundFifth)).toBeLessThanOrEqual(CFIFTH_TOLERANCE_CENTS);
    }
  );
});

// ── findHarmonicFrequency – multiple harmonics simultaneously ────────────────

describe('findHarmonicFrequency – multiple harmonics simultaneously', () => {
  it('correctly separates fundamental, octave, and compound fifth from a composite signal', () => {
    const fundamental = 293.66; // D4
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1.0, 0.7, 0.4]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);

    const f1 = findHarmonicFrequency(freqData, fundamental, SAMPLE_RATE, FFT_SIZE);
    const f2 = findHarmonicFrequency(freqData, fundamental * 2, SAMPLE_RATE, FFT_SIZE);
    const f3 = findHarmonicFrequency(freqData, fundamental * 3, SAMPLE_RATE, FFT_SIZE);

    expect(f1).not.toBeNull();
    expect(f2).not.toBeNull();
    expect(f3).not.toBeNull();

    expect(centDeviation(f1!, fundamental)).toBeLessThanOrEqual(5);
    expect(centDeviation(f2!, fundamental * 2)).toBeLessThanOrEqual(2);
    expect(centDeviation(f3!, fundamental * 3)).toBeLessThanOrEqual(5);
  });

  it('harmonic amplitudes do not cross-contaminate peak positions', () => {
    const fundamental = 440.0; // A4
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1.0, 0.5, 0.25]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);

    const f1 = findHarmonicFrequency(freqData, fundamental, SAMPLE_RATE, FFT_SIZE);
    const f2 = findHarmonicFrequency(freqData, fundamental * 2, SAMPLE_RATE, FFT_SIZE);

    // The octave peak should be closer to 880 Hz than to 440 Hz
    if (f1 !== null && f2 !== null) {
      expect(Math.abs(f1 - fundamental)).toBeLessThan(Math.abs(f1 - fundamental * 2));
      expect(Math.abs(f2 - fundamental * 2)).toBeLessThan(Math.abs(f2 - fundamental));
    }
  });
});

// ── findHarmonicFrequency – below noise floor ────────────────────────────────

describe('findHarmonicFrequency – noise floor rejection', () => {
  it('returns null for a spectrum with all values below -65 dB', () => {
    // Fill the entire spectrum with -80 dB (below the -65 dB rejection threshold)
    const silentSpectrum = new Float32Array(FFT_SIZE / 2).fill(-80);
    const result = findHarmonicFrequency(silentSpectrum, 440, SAMPLE_RATE, FFT_SIZE);
    expect(result).toBeNull();
  });
});

// ── Harmonic strength variation ──────────────────────────────────────────────

describe('findHarmonicFrequency – harmonic strength variation', () => {
  const fundamental = 392.0; // G4

  it.each([
    { ratio: 'octave', mult: 2, tol: 2 },
    { ratio: 'compound fifth', mult: 3, tol: 5 },
  ])(
    'detects the $ratio even when weaker than fundamental',
    ({ mult, tol }) => {
      // Harmonic is much weaker than fundamental (10:1 ratio)
      const amps: [number, number, number] = mult === 2 ? [1, 0.1, 0] : [1, 0.3, 0.1];
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, amps);
      const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
      const target = fundamental * mult;
      const detected = findHarmonicFrequency(freqData, target, SAMPLE_RATE, FFT_SIZE);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, target)).toBeLessThanOrEqual(tol);
    }
  );
});
