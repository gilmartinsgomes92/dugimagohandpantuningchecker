/**
 * Unit tests for music theory utility functions.
 *
 * Validates:
 * - frequencyToNote: correct note name, octave, MIDI number, and cents deviation
 * - midiToFrequency: round-trip accuracy with frequencyToNote
 * - centsDeviation: signed/unsigned accuracy
 * - formatCents: string formatting
 * - centsToColor: colour thresholds
 */

import {
  frequencyToNote,
  midiToFrequency,
  centsDeviation,
  formatCents,
  centsToColor,
} from '../../utils/musicUtils';

// ── midiToFrequency ──────────────────────────────────────────────────────────

describe('midiToFrequency', () => {
  it('returns 440 Hz for MIDI note 69 (A4)', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440.0, 4);
  });

  it('returns 261.63 Hz for MIDI note 60 (C4)', () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it('doubles frequency for each octave step', () => {
    const a3 = midiToFrequency(57); // A3
    const a4 = midiToFrequency(69); // A4
    const a5 = midiToFrequency(81); // A5
    expect(a4 / a3).toBeCloseTo(2, 5);
    expect(a5 / a4).toBeCloseTo(2, 5);
  });
});

// ── frequencyToNote ──────────────────────────────────────────────────────────

describe('frequencyToNote', () => {
  it('identifies A4 (440 Hz) correctly', () => {
    const result = frequencyToNote(440.0);
    expect(result.name).toBe('A');
    expect(result.octave).toBe(4);
    expect(result.fullName).toBe('A4');
    expect(result.midiNote).toBe(69);
    expect(result.cents).toBeCloseTo(0, 4);
  });

  it('identifies C4 (261.63 Hz) correctly', () => {
    const result = frequencyToNote(261.63);
    expect(result.name).toBe('C');
    expect(result.octave).toBe(4);
    expect(result.fullName).toBe('C4');
    expect(result.midiNote).toBe(60);
    expect(Math.abs(result.cents)).toBeLessThan(1);
  });

  it('identifies D3 (146.83 Hz) correctly', () => {
    const result = frequencyToNote(146.83);
    expect(result.name).toBe('D');
    expect(result.octave).toBe(3);
    expect(result.fullName).toBe('D3');
  });

  it('rounds to the nearest semitone and reports correct cents deviation', () => {
    // 10 cents sharp of A4 = 440 * 2^(10/1200)
    const freq = 440 * Math.pow(2, 10 / 1200);
    const result = frequencyToNote(freq);
    expect(result.fullName).toBe('A4');
    expect(result.cents).toBeCloseTo(10, 1);
  });

  it('reports negative cents for flat notes', () => {
    // 15 cents flat of A4
    const freq = 440 * Math.pow(2, -15 / 1200);
    const result = frequencyToNote(freq);
    expect(result.fullName).toBe('A4');
    expect(result.cents).toBeCloseTo(-15, 1);
  });

  it('round-trips through midiToFrequency with <0.01 cents error', () => {
    for (let midi = 50; midi <= 84; midi++) {
      const freq = midiToFrequency(midi);
      const result = frequencyToNote(freq);
      expect(result.midiNote).toBe(midi);
      expect(Math.abs(result.cents)).toBeLessThan(0.01);
    }
  });
});

// ── centsDeviation ───────────────────────────────────────────────────────────

describe('centsDeviation', () => {
  it('returns 0 when both frequencies are identical', () => {
    expect(centsDeviation(440, 440)).toBeCloseTo(0, 6);
  });

  it('returns +100 for one semitone sharp', () => {
    const oneUp = 440 * Math.pow(2, 1 / 12);
    expect(centsDeviation(oneUp, 440)).toBeCloseTo(100, 2);
  });

  it('returns -100 for one semitone flat', () => {
    const oneDown = 440 * Math.pow(2, -1 / 12);
    expect(centsDeviation(oneDown, 440)).toBeCloseTo(-100, 2);
  });

  it('returns +1200 for a perfect octave up', () => {
    expect(centsDeviation(880, 440)).toBeCloseTo(1200, 2);
  });

  it('is antisymmetric: centsDeviation(a,b) = -centsDeviation(b,a)', () => {
    const a = 440;
    const b = 523.25;
    expect(centsDeviation(a, b)).toBeCloseTo(-centsDeviation(b, a), 4);
  });
});

// ── formatCents ──────────────────────────────────────────────────────────────

describe('formatCents', () => {
  it('formats positive cents with + sign', () => {
    expect(formatCents(5.0)).toBe('+5.0¢');
  });

  it('formats negative cents with − sign', () => {
    expect(formatCents(-3.5)).toBe('-3.5¢');
  });

  it('formats zero cents as +0.0¢', () => {
    expect(formatCents(0)).toBe('+0.0¢');
  });

  it('includes one decimal place', () => {
    expect(formatCents(12.345)).toBe('+12.3¢');
  });
});

// ── centsToColor ─────────────────────────────────────────────────────────────

describe('centsToColor', () => {
  it('returns green for 0 cents (perfect tuning)', () => {
    expect(centsToColor(0)).toBe('#00ff88');
  });

  it('returns green for ±2 cents', () => {
    expect(centsToColor(2)).toBe('#00ff88');
    expect(centsToColor(-2)).toBe('#00ff88');
  });

  it('returns yellow-green for 3–5 cents', () => {
    expect(centsToColor(3)).toBe('#88ff00');
    expect(centsToColor(5)).toBe('#88ff00');
  });

  it('returns yellow for 6–10 cents', () => {
    expect(centsToColor(6)).toBe('#ffcc00');
    expect(centsToColor(10)).toBe('#ffcc00');
  });

  it('returns orange for 11–20 cents', () => {
    expect(centsToColor(11)).toBe('#ff8800');
    expect(centsToColor(20)).toBe('#ff8800');
  });

  it('returns red for > 20 cents', () => {
    expect(centsToColor(21)).toBe('#ff2200');
    expect(centsToColor(50)).toBe('#ff2200');
  });
});
