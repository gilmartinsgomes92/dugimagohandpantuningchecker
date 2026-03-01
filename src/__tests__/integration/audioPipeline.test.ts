/**
 * Integration tests for the complete audio processing pipeline.
 *
 * These tests exercise the chain:
 *   generateSineWave / generateHarmonicSignal
 *     → detectPitch (YIN)
 *       → findHarmonicFrequency (FFT harmonics)
 *
 * and validate that the end-to-end pipeline meets the accuracy goals:
 *   - Fundamental detection: ±3 cents
 *   - Octave (2×) detection: ±2 cents
 *   - Compound fifth (3×) detection: ±5 cents
 */

import { detectPitch } from '../../utils/yin';
import { findHarmonicFrequency } from '../../utils/harmonicAnalyzer';
import {
  generateSineWave,
  generateHarmonicSignal,
  computeFFTMagnitudeDB,
  centDeviation,
} from '../utils/testHelpers';
import { HANDPAN_REFERENCE_NOTES, KURD_D3_SCALE } from '../fixtures/handpanReferenceData';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

// ── Fundamental detection pipeline ──────────────────────────────────────────

describe('Pipeline – fundamental detection with synthetic signals', () => {
  it('detects a pure D4 sine wave within ±3 cents end-to-end', () => {
    const fundamental = 293.66;
    const buf = generateSineWave(fundamental, SAMPLE_RATE, FFT_SIZE, 0.5);
    const detected = detectPitch(buf, SAMPLE_RATE);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, fundamental)).toBeLessThanOrEqual(3);
  });

  it('detects D3 (lowest handpan note) within ±3 cents', () => {
    const fundamental = 146.83;
    const buf = generateSineWave(fundamental, SAMPLE_RATE, FFT_SIZE, 0.5);
    const detected = detectPitch(buf, SAMPLE_RATE);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, fundamental)).toBeLessThanOrEqual(3);
  });

  it('detects C6 (upper handpan range) within ±3 cents', () => {
    const fundamental = 1046.5;
    const buf = generateSineWave(fundamental, SAMPLE_RATE, FFT_SIZE, 0.5);
    const detected = detectPitch(buf, SAMPLE_RATE);
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, fundamental)).toBeLessThanOrEqual(3);
  });
});

// ── Phase-shifted signals (off-centre strikes) ───────────────────────────────

describe('Pipeline – phase-shifted signals', () => {
  const FUNDAMENTAL = 440.0; // A4
  const phases = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];

  it.each(phases)(
    'detects A4 with phase offset %f rad within ±3 cents',
    phase => {
      const buf = generateSineWave(FUNDAMENTAL, SAMPLE_RATE, FFT_SIZE, 0.5, phase);
      const detected = detectPitch(buf, SAMPLE_RATE);
      expect(detected).not.toBeNull();
      expect(centDeviation(detected!, FUNDAMENTAL)).toBeLessThanOrEqual(3);
    }
  );
});

// ── Harmonic detection pipeline ──────────────────────────────────────────────

describe('Pipeline – harmonic detection from composite signals', () => {
  it('detects the octave (2×) of D4 within ±2 cents from a harmonic signal', () => {
    const fundamental = 293.66;
    const buf = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1, 0.8, 0.4]);
    const freqData = computeFFTMagnitudeDB(buf, FFT_SIZE);
    const octave = findHarmonicFrequency(freqData, fundamental * 2, SAMPLE_RATE, FFT_SIZE);
    expect(octave).not.toBeNull();
    expect(centDeviation(octave!, fundamental * 2)).toBeLessThanOrEqual(2);
  });

  it('detects the compound fifth (3×) of D4 within ±5 cents from a harmonic signal', () => {
    const fundamental = 293.66;
    const buf = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1, 0.6, 0.8]);
    const freqData = computeFFTMagnitudeDB(buf, FFT_SIZE);
    const cfifth = findHarmonicFrequency(freqData, fundamental * 3, SAMPLE_RATE, FFT_SIZE);
    expect(cfifth).not.toBeNull();
    expect(centDeviation(cfifth!, fundamental * 3)).toBeLessThanOrEqual(5);
  });

  it('detects both octave and compound fifth of A4 simultaneously', () => {
    const fundamental = 440.0;
    const buf = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1, 0.7, 0.5]);
    const freqData = computeFFTMagnitudeDB(buf, FFT_SIZE);

    const octave = findHarmonicFrequency(freqData, fundamental * 2, SAMPLE_RATE, FFT_SIZE);
    const cfifth = findHarmonicFrequency(freqData, fundamental * 3, SAMPLE_RATE, FFT_SIZE);

    expect(octave).not.toBeNull();
    expect(cfifth).not.toBeNull();
    expect(centDeviation(octave!, fundamental * 2)).toBeLessThanOrEqual(2);
    expect(centDeviation(cfifth!, fundamental * 3)).toBeLessThanOrEqual(5);
  });
});

// ── Kurd D3 scale validation ─────────────────────────────────────────────────

describe('Pipeline – Kurd D3 scale validation', () => {
  it('detects all 9 notes of the Kurd D3 scale within ±3 cents', () => {
    const failures: string[] = [];
    for (const note of KURD_D3_SCALE) {
      const buf = generateSineWave(note.fundamental, SAMPLE_RATE, FFT_SIZE, 0.5);
      const detected = detectPitch(buf, SAMPLE_RATE);
      if (detected === null || centDeviation(detected, note.fundamental) > note.fundamentalToleranceCents) {
        failures.push(
          `${note.fullName}: expected ${note.fundamental} Hz, got ${detected?.toFixed(2) ?? 'null'}`
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

// ── Reference-note ground-truth validation ───────────────────────────────────

describe('Pipeline – ground-truth frequency validation', () => {
  it('meets ±3 cents accuracy for all HANDPAN_REFERENCE_NOTES fundamentals', () => {
    const failures: string[] = [];
    for (const note of HANDPAN_REFERENCE_NOTES) {
      const buf = generateSineWave(note.fundamental, SAMPLE_RATE, FFT_SIZE, 0.5);
      const detected = detectPitch(buf, SAMPLE_RATE);
      if (
        detected === null ||
        centDeviation(detected, note.fundamental) > note.fundamentalToleranceCents
      ) {
        failures.push(
          `${note.fullName}: expected ${note.fundamental} Hz, got ${detected?.toFixed(2) ?? 'null'}`
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('meets ±2 cents accuracy for octave partials of all reference notes', () => {
    const failures: string[] = [];
    for (const note of HANDPAN_REFERENCE_NOTES) {
      const buf = generateHarmonicSignal(note.fundamental, SAMPLE_RATE, FFT_SIZE, [0.8, 1.0, 0.3]);
      const freqData = computeFFTMagnitudeDB(buf, FFT_SIZE);
      const detected = findHarmonicFrequency(freqData, note.octave, SAMPLE_RATE, FFT_SIZE);
      if (detected === null || centDeviation(detected, note.octave) > note.octaveToleranceCents) {
        failures.push(
          `${note.fullName} octave: expected ${note.octave} Hz, got ${detected?.toFixed(2) ?? 'null'}`
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('meets ±5 cents accuracy for compound-fifth partials of all reference notes', () => {
    const failures: string[] = [];
    for (const note of HANDPAN_REFERENCE_NOTES) {
      // Compound fifth at 3× fundamental must be within 4200 Hz (AnalyserNode limit)
      if (note.compoundFifth > 4200) continue;
      const buf = generateHarmonicSignal(note.fundamental, SAMPLE_RATE, FFT_SIZE, [0.8, 0.5, 1.0]);
      const freqData = computeFFTMagnitudeDB(buf, FFT_SIZE);
      const detected = findHarmonicFrequency(freqData, note.compoundFifth, SAMPLE_RATE, FFT_SIZE);
      if (detected === null || centDeviation(detected, note.compoundFifth) > note.compoundFifthToleranceCents) {
        failures.push(
          `${note.fullName} 3×: expected ${note.compoundFifth} Hz, got ${detected?.toFixed(2) ?? 'null'}`
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
