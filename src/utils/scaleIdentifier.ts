/**
 * Scale identification utility.
 * Matches a set of detected pitch classes against the handpan scale database
 * and returns all scales that are consistent with the detected notes.
 *
 * Handles:
 *  - Enharmonic equivalents (C#/Db both map to pitch class 1)
 *  - Octave duplications (same note played in different octaves)
 *  - Partial matches when fewer notes than a full scale have been detected
 */

import { HANDPAN_SCALES_DB } from '../data/handpanScales';
import type { HandpanScale } from '../data/handpanScales';

export interface ScaleMatch {
  scale: HandpanScale;
  /** Number of detected pitch classes that are in this scale */
  matchedCount: number;
  /** Total unique pitch classes in the scale */
  scaleSize: number;
  /** True when every detected pitch class is present in the scale */
  isFullyContained: boolean;
  /** True when the detected set exactly equals the scale's pitch-class set */
  isExactMatch: boolean;
}

/**
 * Given a set of detected pitch class numbers (0–11),
 * returns all scales from the database that contain every detected pitch class.
 * Results are sorted: exact matches first, then by matchedCount descending.
 */
export function identifyScales(detectedPitchClasses: number[]): ScaleMatch[] {
  if (detectedPitchClasses.length === 0) return [];

  // Deduplicate detected pitch classes
  const detectedSet = new Set(detectedPitchClasses);

  const results: ScaleMatch[] = [];

  for (const scale of HANDPAN_SCALES_DB) {
    const scalePcSet = new Set(scale.pitchClasses);

    let matchedCount = 0;
    for (const dpc of detectedSet) {
      if (scalePcSet.has(dpc)) matchedCount++;
    }

    const isFullyContained = matchedCount === detectedSet.size;
    const isExactMatch = isFullyContained && detectedSet.size === scalePcSet.size;

    // Only include scales where all detected notes are present in the scale
    if (isFullyContained) {
      results.push({
        scale,
        matchedCount,
        scaleSize: scalePcSet.size,
        isFullyContained,
        isExactMatch,
      });
    }
  }

  // Sort: exact matches first, then partial matches with more matched notes first
  results.sort((a, b) => {
    if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
    return b.matchedCount - a.matchedCount;
  });

  return results;
}

/**
 * Converts a note name string (e.g. "C#", "Db", "A") to its pitch class number (0–11).
 * Returns null if the name is unrecognised.
 */
export function noteToPitchClass(noteName: string): number | null {
  const map: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  return map[noteName] ?? null;
}
