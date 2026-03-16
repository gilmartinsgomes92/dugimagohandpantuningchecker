/**
 * Unit tests for StrobeTuningPage pure helper functions.
 *
 * The component itself requires a DOM / React rendering environment, but the
 * pure helper functions exported from StrobeTuningPage are tested here in the
 * existing Node test environment without any DOM setup.
 *
 * Covered areas:
 *  - getCentsStatus   – icon and CSS class for a given cents deviation
 *  - octaveNoteName   – derives octave note name from fundamental name
 *  - Display tolerance constants
 */

import {
  getCentsStatus,
  octaveNoteName,
  FUND_DISPLAY_TOLERANCE,
  OCTAVE_DISPLAY_TOLERANCE,
  COMP_FIFTH_DISPLAY_TOLERANCE,
} from '../../utils/strobeTuningUtils';

// ── getCentsStatus ────────────────────────────────────────────────────────────

describe('getCentsStatus – null input', () => {
  it('returns pending icon and class when cents is null', () => {
    const result = getCentsStatus(null, 2);
    expect(result.icon).toBe('—');
    expect(result.className).toBe('partial-pending');
  });
});

describe('getCentsStatus – in-tune range (fundamental tolerance = 2¢)', () => {
  const T = FUND_DISPLAY_TOLERANCE; // 2

  it('returns ✓ and partial-in-tune for exactly 0 cents', () => {
    const r = getCentsStatus(0, T);
    expect(r.icon).toBe('✓');
    expect(r.className).toBe('partial-in-tune');
  });

  it('returns ✓ for +tolerance (boundary)', () => {
    const r = getCentsStatus(T, T);
    expect(r.icon).toBe('✓');
    expect(r.className).toBe('partial-in-tune');
  });

  it('returns ✓ for −tolerance (boundary)', () => {
    const r = getCentsStatus(-T, T);
    expect(r.icon).toBe('✓');
    expect(r.className).toBe('partial-in-tune');
  });

  it('returns ⚠ for tolerance + epsilon (just outside in-tune)', () => {
    const r = getCentsStatus(T + 0.001, T);
    expect(r.icon).toBe('⚠');
    expect(r.className).toBe('partial-slightly-out');
  });
});

describe('getCentsStatus – slightly-out range', () => {
  const T = FUND_DISPLAY_TOLERANCE; // 2

  it('returns ⚠ and partial-slightly-out for 1.5× tolerance', () => {
    const r = getCentsStatus(T * 1.5, T);
    expect(r.icon).toBe('⚠');
    expect(r.className).toBe('partial-slightly-out');
  });

  it('returns ⚠ at 2.5× tolerance (boundary)', () => {
    // getCentsStatus uses abs <= tolerance * 2.5 for the "slightly out" band
    const r = getCentsStatus(T * 2.5, T);
    expect(r.icon).toBe('⚠');
    expect(r.className).toBe('partial-slightly-out');
  });

  it('returns ✗ just beyond 2.5× tolerance', () => {
    const r = getCentsStatus(T * 2.5 + 0.001, T);
    expect(r.icon).toBe('✗');
    expect(r.className).toBe('partial-out-of-tune');
  });
});

describe('getCentsStatus – out-of-tune range', () => {
  it('returns ✗ and partial-out-of-tune for large positive deviation', () => {
    const r = getCentsStatus(50, 2);
    expect(r.icon).toBe('✗');
    expect(r.className).toBe('partial-out-of-tune');
  });

  it('returns ✗ for large negative deviation', () => {
    const r = getCentsStatus(-50, 2);
    expect(r.icon).toBe('✗');
    expect(r.className).toBe('partial-out-of-tune');
  });
});

describe('getCentsStatus – compound-fifth tolerance (5¢)', () => {
  const T = COMP_FIFTH_DISPLAY_TOLERANCE; // 5

  it('returns ✓ at exactly ±5¢', () => {
    expect(getCentsStatus(5, T).icon).toBe('✓');
    expect(getCentsStatus(-5, T).icon).toBe('✓');
  });

  it('returns ⚠ at 6¢ (just outside in-tune for 5¢ tolerance)', () => {
    expect(getCentsStatus(6, T).icon).toBe('⚠');
  });

  it('returns ✗ beyond 2.5×5=12.5¢', () => {
    expect(getCentsStatus(13, T).icon).toBe('✗');
  });
});

// ── octaveNoteName ────────────────────────────────────────────────────────────

describe('octaveNoteName – derives octave note from fundamental', () => {
  it('increments the octave digit of a simple note (D3 → D4)', () => {
    expect(octaveNoteName('D3')).toBe('D4');
  });

  it('increments the octave digit of A4 → A5', () => {
    expect(octaveNoteName('A4')).toBe('A5');
  });

  it('handles sharps: F#3 → F#4', () => {
    expect(octaveNoteName('F#3')).toBe('F#4');
  });

  it('handles sharps with hash sign: C#2 → C#3', () => {
    expect(octaveNoteName('C#2')).toBe('C#3');
  });

  it('wraps octave 9 → 10 (multi-digit)', () => {
    expect(octaveNoteName('A9')).toBe('A10');
  });
});

// ── Display tolerance constants ───────────────────────────────────────────────

describe('Display tolerance constants', () => {
  it('FUND_DISPLAY_TOLERANCE is 2', () => {
    expect(FUND_DISPLAY_TOLERANCE).toBe(2);
  });

  it('OCTAVE_DISPLAY_TOLERANCE is 2', () => {
    expect(OCTAVE_DISPLAY_TOLERANCE).toBe(2);
  });

  it('COMP_FIFTH_DISPLAY_TOLERANCE is 5', () => {
    expect(COMP_FIFTH_DISPLAY_TOLERANCE).toBe(5);
  });
});
