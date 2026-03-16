/**
 * Unit tests for the spectral template matcher.
 *
 * Validates:
 * - matchNote returns null for silent / below-threshold signals
 * - matchNote identifies the correct note for synthetic harmonic signals
 * - matchNote works when the octave is louder than the fundamental
 * - matchNote score is above the minimum threshold for valid signals
 * - Score is within [0, 1]
 */

import { matchNote } from '../../utils/spectralMatcher';
import { generateHarmonicSignal, computeFFTMagnitudeDB } from './testHelpers';
import { HANDPAN_REFERENCE_NOTES } from '../fixtures/handpanReferenceData';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

// ── Silent / noise floor ─────────────────────────────────────────────────────

describe('matchNote – silent spectrum', () => {
  it('returns null for a spectrum with all values below the noise floor', () => {
    const silentSpectrum = new Float32Array(FFT_SIZE / 2).fill(-80);
    expect(matchNote(silentSpectrum, SAMPLE_RATE, FFT_SIZE)).toBeNull();
  });
});

// ── Note identification ───────────────────────────────────────────────────────

describe('matchNote – correct note identification', () => {
  const notesToTest = HANDPAN_REFERENCE_NOTES.filter(n =>
    ['D3', 'D4', 'A4', 'C5', 'G4'].includes(n.fullName)
  );

  it.each(notesToTest)(
    'identifies $fullName from a standard harmonic signal',
    ({ fullName, fundamental }) => {
      // Standard handpan amplitude profile: fundamental + octave + compound fifth
      const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [1.0, 0.7, 0.4]);
      const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
      const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

      expect(result).not.toBeNull();
      // Verify the matched note is within ±1 semitone of the expected note
      const expectedMidi = Math.round(12 * Math.log2(fundamental / 440) + 69);
      expect(Math.abs(result!.midiNote - expectedMidi)).toBeLessThanOrEqual(1);
      // The nominal frequency should be close to the fundamental
      const centError = Math.abs(1200 * Math.log2(result!.nominalFreq / fundamental));
      expect(centError).toBeLessThanOrEqual(60); // within 1 semitone
      // Friendly description used in test output
      void fullName;
    }
  );
});

// ── Octave-dominant signals ───────────────────────────────────────────────────

describe('matchNote – octave louder than fundamental', () => {
  it('still identifies D4 when the octave (2f) is louder than the fundamental', () => {
    const fundamental = 293.66; // D4
    // Simulate handpan behaviour: octave at 1.5× the fundamental amplitude
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [0.5, 1.5, 0.6]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

    expect(result).not.toBeNull();
    const expectedMidi = Math.round(12 * Math.log2(fundamental / 440) + 69);
    expect(Math.abs(result!.midiNote - expectedMidi)).toBeLessThanOrEqual(1);
  });

  it('still identifies A4 when the compound fifth (3f) is louder than the fundamental', () => {
    const fundamental = 440.0; // A4
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, FFT_SIZE, [0.4, 0.8, 1.2]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

    expect(result).not.toBeNull();
    const expectedMidi = Math.round(12 * Math.log2(fundamental / 440) + 69);
    expect(Math.abs(result!.midiNote - expectedMidi)).toBeLessThanOrEqual(1);
  });
});

// ── Score quality ─────────────────────────────────────────────────────────────

describe('matchNote – score range', () => {
  it('returns a score in [0, 1] for a strong harmonic signal', () => {
    const signal = generateHarmonicSignal(440.0, SAMPLE_RATE, FFT_SIZE, [1.0, 0.8, 0.5]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(1);
  });

  it('returns a score above the minimum threshold (0.3) for a valid signal', () => {
    const signal = generateHarmonicSignal(293.66, SAMPLE_RATE, FFT_SIZE, [1.0, 0.7, 0.4]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.3);
  });
});

// ── nominalFreq sanity ────────────────────────────────────────────────────────

describe('matchNote – nominalFreq is a standard ET frequency', () => {
  it('nominalFreq for A4 signal is close to 440 Hz', () => {
    const signal = generateHarmonicSignal(440.0, SAMPLE_RATE, FFT_SIZE, [1.0, 0.7, 0.4]);
    const freqData = computeFFTMagnitudeDB(signal, FFT_SIZE);
    const result = matchNote(freqData, SAMPLE_RATE, FFT_SIZE);

    expect(result).not.toBeNull();
    // nominalFreq should be the ET frequency of the matched MIDI note
    const etFreq = 440 * Math.pow(2, (result!.midiNote - 69) / 12);
    expect(Math.abs(result!.nominalFreq - etFreq)).toBeLessThan(0.01);
  });
});
