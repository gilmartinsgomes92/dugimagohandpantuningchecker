/**
 * Acoustic reference data for handpan testing.
 *
 * Frequencies are based on equal-temperament A4=440 Hz tuning,
 * covering the typical handpan range D3–C6.
 * Each entry includes per-note tolerance thresholds used in validation tests.
 */

/** A reference note entry with expected frequencies and tolerance thresholds. */
export interface HandpanReferenceNote {
  /** Note name including octave, e.g. "D3" */
  fullName: string;
  /** Fundamental frequency in Hz (equal temperament, A4=440) */
  fundamental: number;
  /** Expected octave partial (2× fundamental) frequency in Hz */
  octave: number;
  /** Expected compound-fifth partial (3× fundamental) frequency in Hz */
  compoundFifth: number;
  /** Acceptable cents deviation for the fundamental (±cents) */
  fundamentalToleranceCents: number;
  /** Acceptable cents deviation for the octave partial (±cents) */
  octaveToleranceCents: number;
  /** Acceptable cents deviation for the compound-fifth partial (±cents) */
  compoundFifthToleranceCents: number;
}

/**
 * Reference handpan notes spanning D3–C6 in equal temperament.
 * Tolerances reflect the accuracy goals stated in the problem specification:
 *  - Fundamental: ±3 cents
 *  - Octave (2×):  ±2 cents
 *  - Compound fifth (3×): ±5 cents
 */
export const HANDPAN_REFERENCE_NOTES: HandpanReferenceNote[] = [
  // ── Octave 3 ──────────────────────────────────────────────────────────────
  {
    fullName: 'D3',
    fundamental: 146.83,
    octave: 293.66,
    compoundFifth: 440.49,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'E3',
    fundamental: 164.81,
    octave: 329.63,
    compoundFifth: 494.44,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'F3',
    fundamental: 174.61,
    octave: 349.23,
    compoundFifth: 523.84,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'G3',
    fundamental: 196.0,
    octave: 392.0,
    compoundFifth: 588.0,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'A3',
    fundamental: 220.0,
    octave: 440.0,
    compoundFifth: 660.0,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'B3',
    fundamental: 246.94,
    octave: 493.88,
    compoundFifth: 740.82,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  // ── Octave 4 ──────────────────────────────────────────────────────────────
  {
    fullName: 'C4',
    fundamental: 261.63,
    octave: 523.25,
    compoundFifth: 784.88,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'D4',
    fundamental: 293.66,
    octave: 587.33,
    compoundFifth: 880.99,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'E4',
    fundamental: 329.63,
    octave: 659.26,
    compoundFifth: 988.88,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'F4',
    fundamental: 349.23,
    octave: 698.46,
    compoundFifth: 1047.69,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'G4',
    fundamental: 392.0,
    octave: 784.0,
    compoundFifth: 1176.0,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'A4',
    fundamental: 440.0,
    octave: 880.0,
    compoundFifth: 1320.0,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'B4',
    fundamental: 493.88,
    octave: 987.77,
    compoundFifth: 1481.65,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  // ── Octave 5 ──────────────────────────────────────────────────────────────
  {
    fullName: 'C5',
    fundamental: 523.25,
    octave: 1046.5,
    compoundFifth: 1569.75,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'D5',
    fundamental: 587.33,
    octave: 1174.66,
    compoundFifth: 1761.99,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'E5',
    fundamental: 659.26,
    octave: 1318.51,
    compoundFifth: 1977.77,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'F5',
    fundamental: 698.46,
    octave: 1396.91,
    compoundFifth: 2095.37,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'G5',
    fundamental: 783.99,
    octave: 1567.98,
    compoundFifth: 2351.97,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'A5',
    fundamental: 880.0,
    octave: 1760.0,
    compoundFifth: 2640.0,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  {
    fullName: 'B5',
    fundamental: 987.77,
    octave: 1975.53,
    compoundFifth: 2963.3,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
  // ── Octave 6 ──────────────────────────────────────────────────────────────
  {
    fullName: 'C6',
    fundamental: 1046.5,
    octave: 2093.0,
    compoundFifth: 3139.5,
    fundamentalToleranceCents: 3,
    octaveToleranceCents: 2,
    compoundFifthToleranceCents: 5,
  },
];

/** Notes representative of a typical D-minor handpan scale (Kurd D3). */
export const KURD_D3_SCALE: HandpanReferenceNote[] = [
  // dum (bass note)
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'D3')!,
  // tonefield ring
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'A3')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'B3')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'C4')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'D4')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'E4')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'F4')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'G4')!,
  HANDPAN_REFERENCE_NOTES.find(n => n.fullName === 'A4')!,
];
