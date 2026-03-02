/**
 * Unit tests for useStrobeTuner hook logic.
 *
 * The hook's pure helper functions are exported and tested here in the
 * existing Node test environment (no DOM / React rendering required).
 * Covered areas:
 *  - calcCents        – signed cents deviation formula
 *  - windowLo/windowHi – search-window bound calculation
 *  - allPartialsStable – per-partial tolerance checks
 *  - Stability constants (STABLE_FRAME_THRESHOLD and tolerance values)
 *
 * Browser-API-dependent behaviour (AudioContext, getUserMedia,
 * requestAnimationFrame) is exercised in the existing integration test
 * suite that covers the full audio pipeline.
 */

import {
  calcCents,
  windowLo,
  windowHi,
  allPartialsStable,
  FUND_TOLERANCE_CENTS,
  OCTAVE_TOLERANCE_CENTS,
  COMP_FIFTH_TOLERANCE_CENTS,
  STABLE_FRAME_THRESHOLD,
} from '../../hooks/useStrobeTuner';

// ── calcCents ────────────────────────────────────────────────────────────────

describe('calcCents – signed cent deviation', () => {
  it('returns 0 when detected equals target', () => {
    expect(calcCents(440, 440)).toBeCloseTo(0, 5);
  });

  it('returns +100 for one semitone sharp (exactly 1 equal-temperament step)', () => {
    const target = 440;
    const oneUp = target * Math.pow(2, 100 / 1200); // +100 cents
    expect(calcCents(oneUp, target)).toBeCloseTo(100, 3);
  });

  it('returns −100 for one semitone flat', () => {
    const target = 440;
    const oneDown = target * Math.pow(2, -100 / 1200); // −100 cents
    expect(calcCents(oneDown, target)).toBeCloseTo(-100, 3);
  });

  it('returns +1200 for an exact octave above', () => {
    expect(calcCents(880, 440)).toBeCloseTo(1200, 3);
  });

  it('returns −1200 for an exact octave below', () => {
    expect(calcCents(220, 440)).toBeCloseTo(-1200, 3);
  });

  it('correctly reflects sub-cent sharpness', () => {
    // +1 cent above target
    const target = 293.66;
    const sharpBy1 = target * Math.pow(2, 1 / 1200);
    expect(calcCents(sharpBy1, target)).toBeCloseTo(1, 3);
  });

  it('correctly reflects sub-cent flatness', () => {
    // −1 cent below target
    const target = 293.66;
    const flatBy1 = target * Math.pow(2, -1 / 1200);
    expect(calcCents(flatBy1, target)).toBeCloseTo(-1, 3);
  });

  it('works for D3 fundamental (146.83 Hz)', () => {
    const target = 146.83;
    expect(calcCents(target, target)).toBeCloseTo(0, 5);
  });
});

// ── windowLo / windowHi ──────────────────────────────────────────────────────

describe('windowLo – lower search bound', () => {
  it('is below the target frequency for any positive width', () => {
    expect(windowLo(440, 20)).toBeLessThan(440);
  });

  it('equals target when width is 0', () => {
    expect(windowLo(440, 0)).toBeCloseTo(440, 5);
  });

  it('produces the correct lower bound for a ±20-cent window around A4', () => {
    const lo = windowLo(440, 20);
    // Inverse check: calcCents(lo, 440) should be ≈ −20
    expect(calcCents(lo, 440)).toBeCloseTo(-20, 3);
  });

  it('produces the correct lower bound for a ±15-cent window around D4 octave', () => {
    const target = 293.66 * 2; // 587.32 Hz
    const lo = windowLo(target, 15);
    expect(calcCents(lo, target)).toBeCloseTo(-15, 3);
  });
});

describe('windowHi – upper search bound', () => {
  it('is above the target frequency for any positive width', () => {
    expect(windowHi(440, 20)).toBeGreaterThan(440);
  });

  it('equals target when width is 0', () => {
    expect(windowHi(440, 0)).toBeCloseTo(440, 5);
  });

  it('produces the correct upper bound for a ±20-cent window around A4', () => {
    const hi = windowHi(440, 20);
    expect(calcCents(hi, 440)).toBeCloseTo(20, 3);
  });

  it('windowLo < target < windowHi for non-zero width', () => {
    const target = 146.83;
    expect(windowLo(target, 20)).toBeLessThan(target);
    expect(windowHi(target, 20)).toBeGreaterThan(target);
  });
});

// ── allPartialsStable ────────────────────────────────────────────────────────

describe('allPartialsStable – stability check', () => {
  it('returns true when all three partials are exactly at 0 cents', () => {
    expect(allPartialsStable(0, 0, 0)).toBe(true);
  });

  it('returns true when each partial is within its tolerance', () => {
    // fundamental within ±2, octave within ±2, compound-fifth within ±5
    expect(allPartialsStable(
      FUND_TOLERANCE_CENTS,
      OCTAVE_TOLERANCE_CENTS,
      COMP_FIFTH_TOLERANCE_CENTS,
    )).toBe(true);
    expect(allPartialsStable(
      -FUND_TOLERANCE_CENTS,
      -OCTAVE_TOLERANCE_CENTS,
      -COMP_FIFTH_TOLERANCE_CENTS,
    )).toBe(true);
  });

  it('returns false when fundamental exceeds tolerance by epsilon', () => {
    const eps = 0.001;
    expect(allPartialsStable(FUND_TOLERANCE_CENTS + eps, 0, 0)).toBe(false);
    expect(allPartialsStable(-(FUND_TOLERANCE_CENTS + eps), 0, 0)).toBe(false);
  });

  it('returns false when octave exceeds tolerance by epsilon', () => {
    const eps = 0.001;
    expect(allPartialsStable(0, OCTAVE_TOLERANCE_CENTS + eps, 0)).toBe(false);
  });

  it('returns false when compound-fifth exceeds tolerance by epsilon', () => {
    const eps = 0.001;
    expect(allPartialsStable(0, 0, COMP_FIFTH_TOLERANCE_CENTS + eps)).toBe(false);
  });

  it('returns false when fundamental is null', () => {
    expect(allPartialsStable(null, 0, 0)).toBe(false);
    expect(allPartialsStable(null, null, null)).toBe(false);
  });

  it('returns true when octave is null (optional partial)', () => {
    expect(allPartialsStable(0, null, 0)).toBe(true);
  });

  it('returns true when compound-fifth is null (optional partial)', () => {
    expect(allPartialsStable(0, 0, null)).toBe(true);
  });

  it('returns false when only two of three partials are within tolerance', () => {
    expect(allPartialsStable(0, 0, COMP_FIFTH_TOLERANCE_CENTS + 1)).toBe(false);
    expect(allPartialsStable(0, OCTAVE_TOLERANCE_CENTS + 1, 0)).toBe(false);
  });
});

// ── Stability constants ──────────────────────────────────────────────────────

describe('Stability constants', () => {
  it('FUND_TOLERANCE_CENTS is 2', () => {
    expect(FUND_TOLERANCE_CENTS).toBe(2);
  });

  it('OCTAVE_TOLERANCE_CENTS is 2', () => {
    expect(OCTAVE_TOLERANCE_CENTS).toBe(2);
  });

  it('COMP_FIFTH_TOLERANCE_CENTS is 5', () => {
    expect(COMP_FIFTH_TOLERANCE_CENTS).toBe(5);
  });

  it('STABLE_FRAME_THRESHOLD is 30', () => {
    expect(STABLE_FRAME_THRESHOLD).toBe(30);
  });
});

// ── Stability frame counting logic ───────────────────────────────────────────

describe('Stability frame counting logic (simulated loop)', () => {
  /**
   * Simulates the RAF loop stability-counter logic used inside the hook.
   * Returns { stabilityFrames, isStable } after processing `readings`.
   */
  function simulateFrames(
    readings: Array<{ fundCents: number | null; octCents: number | null; cfCents: number | null }>,
  ): { stabilityFrames: number; isStable: boolean } {
    let frames = 0;
    for (const { fundCents, octCents, cfCents } of readings) {
      if (allPartialsStable(fundCents, octCents, cfCents)) {
        frames += 1;
      } else {
        frames = Math.max(0, frames - 2);
      }
    }
    return { stabilityFrames: frames, isStable: frames >= STABLE_FRAME_THRESHOLD };
  }

  it('increments stabilityFrames while all partials are within tolerance', () => {
    const stable = Array.from({ length: 10 }, () => ({ fundCents: 0, octCents: 0, cfCents: 0 }));
    const { stabilityFrames } = simulateFrames(stable);
    expect(stabilityFrames).toBe(10);
  });

  it('decrements stabilityFrames by 2 (soft reset) when any partial goes out of tolerance', () => {
    const readings = [
      ...Array.from({ length: 5 }, () => ({ fundCents: 0, octCents: 0, cfCents: 0 })),
      { fundCents: 10, octCents: 0, cfCents: 0 }, // out-of-tolerance frame
    ];
    const { stabilityFrames } = simulateFrames(readings);
    expect(stabilityFrames).toBe(3); // 5 - 2 = 3
  });

  it('resumes counting after a transient instability (soft reset preserves partial progress)', () => {
    const readings = [
      ...Array.from({ length: 5 }, () => ({ fundCents: 0, octCents: 0, cfCents: 0 })),
      { fundCents: 10, octCents: 0, cfCents: 0 }, // soft-reset: 5 → 3
      ...Array.from({ length: 3 }, () => ({ fundCents: 1, octCents: 1, cfCents: 2 })), // stable again
    ];
    const { stabilityFrames } = simulateFrames(readings);
    expect(stabilityFrames).toBe(6); // 3 + 3
  });

  it('isStable becomes true after STABLE_FRAME_THRESHOLD consecutive stable frames', () => {
    const readings = Array.from({ length: STABLE_FRAME_THRESHOLD }, () => ({
      fundCents: 0, octCents: 0, cfCents: 0,
    }));
    const { isStable } = simulateFrames(readings);
    expect(isStable).toBe(true);
  });

  it('isStable remains false one frame before reaching the threshold', () => {
    const readings = Array.from({ length: STABLE_FRAME_THRESHOLD - 1 }, () => ({
      fundCents: 0, octCents: 0, cfCents: 0,
    }));
    const { isStable } = simulateFrames(readings);
    expect(isStable).toBe(false);
  });

  it('isStable resets to false after enough out-of-tolerance frames following stability', () => {
    // Start exactly at threshold (30), then 1 unstable frame → 28 < 30 → false.
    const readings = [
      ...Array.from({ length: STABLE_FRAME_THRESHOLD }, () => ({
        fundCents: 0, octCents: 0, cfCents: 0,
      })),
      { fundCents: 50, octCents: 0, cfCents: 0 }, // soft-reset: 30 → 28
    ];
    const { isStable } = simulateFrames(readings);
    expect(isStable).toBe(false);
  });
});

// ── Real frequency detection through detectPitchInWindow ────────────────────

import { detectPitchInWindow } from '../../utils/pitchInWindow';
import {
  generateSineWave,
  generateHarmonicSignal,
  centDeviation,
} from '../utils/testHelpers';

const SAMPLE_RATE = 44100;

describe('useStrobeTuner – frequency detection per partial (via detectPitchInWindow)', () => {
  it('detects D3 fundamental within ±2 cents using the ±20-cent window', () => {
    const target = 146.83;
    const signal = generateSineWave(target, SAMPLE_RATE, 4096, 0.5);
    const detected = detectPitchInWindow(
      signal, SAMPLE_RATE,
      windowLo(target, 20), windowHi(target, 20),
    );
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, target)).toBeLessThanOrEqual(2);
  });

  it('detects D3 octave (2×) within ±2 cents using the ±15-cent window', () => {
    const fundamental = 146.83;
    const target = fundamental * 2;
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, 4096, [0.6, 1.0, 0.0]);
    const detected = detectPitchInWindow(
      signal, SAMPLE_RATE,
      windowLo(target, 15), windowHi(target, 15),
    );
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, target)).toBeLessThanOrEqual(2);
  });

  it('detects D3 compound fifth (3×) within ±5 cents using the ±15-cent window', () => {
    const fundamental = 146.83;
    const target = fundamental * 3;
    const signal = generateHarmonicSignal(fundamental, SAMPLE_RATE, 4096, [0.4, 0.4, 1.0]);
    const detected = detectPitchInWindow(
      signal, SAMPLE_RATE,
      windowLo(target, 15), windowHi(target, 15),
    );
    expect(detected).not.toBeNull();
    expect(centDeviation(detected!, target)).toBeLessThanOrEqual(5);
  });

  it('returns null for below-noise-floor input (error / no audio input)', () => {
    const target = 440;
    const silent = new Float32Array(4096).fill(0);
    const detected = detectPitchInWindow(
      silent, SAMPLE_RATE,
      windowLo(target, 20), windowHi(target, 20),
    );
    expect(detected).toBeNull();
  });

  it('calcCents gives ~0 when detectPitchInWindow detects the exact target', () => {
    const target = 293.66;
    const signal = generateSineWave(target, SAMPLE_RATE, 4096, 0.5);
    const detected = detectPitchInWindow(
      signal, SAMPLE_RATE,
      windowLo(target, 20), windowHi(target, 20),
    );
    expect(detected).not.toBeNull();
    expect(Math.abs(calcCents(detected!, target))).toBeLessThanOrEqual(2);
  });
});
