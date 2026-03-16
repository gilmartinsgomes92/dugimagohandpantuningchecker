/**
 * Pure helper utilities for StrobeTuningPage (Step 2 of the 2-step tuning
 * workflow).  These are kept in a plain .ts file so they can be unit-tested
 * in the existing Node (non-DOM) Jest environment.
 */

/** Tolerance thresholds (cents) for each partial's in-tune badge. */
export const FUND_DISPLAY_TOLERANCE = 2;
export const OCTAVE_DISPLAY_TOLERANCE = 2;
export const COMP_FIFTH_DISPLAY_TOLERANCE = 5;

/**
 * Returns a status icon and CSS class name for a partial based on its
 * cents deviation and the given tolerance.
 *
 * @param cents     - Signed cents deviation, or null when not yet detected.
 * @param tolerance - Maximum |cents| considered "in tune".
 */
export function getCentsStatus(
  cents: number | null,
  tolerance: number,
): { icon: string; className: string } {
  if (cents === null) return { icon: '—', className: 'partial-pending' };
  const abs = Math.abs(cents);
  if (abs <= tolerance)        return { icon: '✓', className: 'partial-in-tune' };
  if (abs <= tolerance * 2.5)  return { icon: '⚠', className: 'partial-slightly-out' };
  return                              { icon: '✗', className: 'partial-out-of-tune' };
}

/**
 * Derives the octave note name from a note name by incrementing the trailing
 * octave digit(s), e.g. "D3" → "D4", "F#3" → "F#4", "A9" → "A10".
 */
export function octaveNoteName(noteName: string): string {
  return noteName.replace(/(\d+)$/, m => String(parseInt(m, 10) + 1));
}
