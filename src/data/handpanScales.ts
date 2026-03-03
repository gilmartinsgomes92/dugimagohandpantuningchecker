export type HandpanScaleDef = {
  /** Community / handpan-market name (you can edit these freely). */
  sceneName: string;
  /** Theoretical / academic label. */
  theoreticalName: string;
  /** Full note names including octave, e.g. "D3", "A3", "Bb3". */
  notes: string[];
};

/**
 * Scale library used by the Scale Identify page.
 * 
 * IMPORTANT: This file is intentionally separate from the existing HANDPAN_SCALES
 * used elsewhere, so Quick Tuning / Guided flows are not affected.
 */
export const HANDPAN_SCALE_LIBRARY: HandpanScaleDef[] = [
  {
    // Commonly sold/marketed as "Kurd" in many handpan communities.
    // (If your naming differs, just change sceneName here.)
    sceneName: 'Kurd',
    theoreticalName: 'D Aeolian (D minor)',
    notes: ['D3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'],
  },
  {
    sceneName: 'Phrygian',
    theoreticalName: 'E Phrygian',
    notes: ['E3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
  },
  {
    sceneName: 'Dorian',
    theoreticalName: 'F Dorian',
    notes: ['F3', 'C4', 'Db4', 'Eb4', 'F4', 'G4', 'Ab4', 'Bb4', 'C5'],
  },
  {
    sceneName: 'Dorian',
    theoreticalName: 'G Dorian',
    notes: ['G3', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5'],
  },
  {
    sceneName: 'Dorian',
    theoreticalName: 'A Dorian',
    notes: ['A3', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
  },
  {
    sceneName: 'Dorian',
    theoreticalName: 'B Dorian',
    notes: ['B3', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5', 'E5', 'F#5'],
  },
  {
    sceneName: 'Dorian',
    theoreticalName: 'C Dorian',
    notes: ['C4', 'G4', 'Ab4', 'Bb4', 'C5', 'D5', 'Eb5', 'F5', 'G5'],
  },
  {
    sceneName: 'Kurd',
    theoreticalName: 'D Phrygian',
    notes: ['D3', 'A3', 'Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4'],
  },
];
