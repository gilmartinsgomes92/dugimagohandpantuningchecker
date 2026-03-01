/**
 * Scale identification utility.
 * Matches a set of detected pitch classes against the handpan scale database
 * and returns all scales that are consistent with the detected notes.
 *
 * Features:
 *  - Enharmonic equivalents (C#/Db both map to pitch class 1)
 *  - Octave de-duplication (same note in different octaves = one pitch class)
 *  - Partial matches when fewer notes than a full scale have been detected
 *  - Ding-based "best match" flag: when the first/lowest detected note matches
 *    a scale's root, that scale is likely the correct key
 */

import { HANDPAN_SCALES_DB } from '../data/handpanScales';
import type { HandpanScale } from '../data/handpanScales';

/** Pitch class map shared by identifyScales and noteToPitchClass */
const PC_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

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
  /**
   * True when the scale's root pitch class matches the ding (first/lowest
   * detected note). Scales with this flag are the most likely candidates
   * for the handpan's actual key.
   */
  isDingMatch: boolean;
}

/**
 * Given a set of detected pitch class numbers (0–11) and an optional ding
 * pitch class, returns all scales from the database that contain every
 * detected pitch class.
 *
 * Results are sorted:
 *   1. Exact match + ding match
 *   2. Exact match
 *   3. Fully contained + ding match (most notes matched first)
 *   4. Fully contained (most notes matched first)
 */
export function identifyScales(
  detectedPitchClasses: number[],
  dingPitchClass?: number,
): ScaleMatch[] {
  if (detectedPitchClasses.length === 0) return [];

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

    if (!isFullyContained) continue;

    const isDingMatch =
      dingPitchClass !== undefined &&
      (PC_MAP[scale.root] ?? -1) === dingPitchClass;

    results.push({
      scale,
      matchedCount,
      scaleSize: scalePcSet.size,
      isFullyContained,
      isExactMatch,
      isDingMatch,
    });
  }

  results.sort((a, b) => {
    // Exact + ding > exact > (fullContained + ding) > fullContained
    const scoreA = (a.isExactMatch ? 4 : 0) + (a.isDingMatch ? 2 : 0) + (a.matchedCount / 20);
    const scoreB = (b.isExactMatch ? 4 : 0) + (b.isDingMatch ? 2 : 0) + (b.matchedCount / 20);
    return scoreB - scoreA;
  });

  return results;
}

/**
 * Converts a note name string (e.g. "C#", "Db", "A") to its pitch class number (0–11).
 * Returns null if the name is unrecognised.
 */
export function noteToPitchClass(noteName: string): number | null {
  return PC_MAP[noteName] ?? null;
}
