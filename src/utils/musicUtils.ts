/**
 * Music theory utilities for the handpan tuner.
 * Handles note naming, frequency calculations, and cents deviation.
 */

// Note names in equal temperament (starting from C)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Reference: A4 = 440 Hz, MIDI note 69
const A4_FREQUENCY = 440.0;
const A4_MIDI = 69;

/**
 * Converts a frequency in Hz to its closest equal-temperament note.
 * Returns note name, octave number, and cents deviation (-50 to +50).
 */
export function frequencyToNote(freq: number): {
  name: string;
  octave: number;
  fullName: string;
  cents: number;
  midiNote: number;
} {
  // MIDI note number (floating point)
  const midiFloat = 12 * Math.log2(freq / A4_FREQUENCY) + A4_MIDI;
  const midiNote = Math.round(midiFloat);

  // Cents deviation from the nearest semitone (logarithmic formula for accuracy)
  const cents = 1200 * Math.log2(freq / midiToFrequency(midiNote));

  // Note name and octave
  const noteIndex = ((midiNote % 12) + 12) % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  const name = NOTE_NAMES[noteIndex];

  return {
    name,
    octave,
    fullName: `${name}${octave}`,
    cents,
    midiNote,
  };
}

/**
 * Returns the exact frequency for a given MIDI note number.
 */
export function midiToFrequency(midiNote: number): number {
  return A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI) / 12);
}

/** Hz deviation thresholds for tuning quality classification */
export const HZ_THRESHOLD_PERFECT = 0.5;    // ≤0.5 Hz: Perfect (green)
export const HZ_THRESHOLD_VERY_GOOD = 1;    // ≤1 Hz: Very good (yellow-green)
export const HZ_THRESHOLD_ACCEPTABLE = 2;   // ≤2 Hz: Acceptable (yellow)
export const HZ_THRESHOLD_MARGINAL = 3;     // ≤3 Hz: Marginal (orange)
// >3 Hz: Out of tune (red)

/**
 * Calculates the Hz difference between a detected frequency and a reference frequency.
 * Positive = sharp, Negative = flat
 */
export function hzDeviation(detectedFreq: number, referenceFreq: number): number {
  return detectedFreq - referenceFreq;
}

/**
 * Formats a Hz deviation value for display with sign and two decimal places.
 */
export function formatHz(hz: number): string {
  const sign = hz >= 0 ? '+' : '';
  return `${sign}${hz.toFixed(2)} Hz`;
}

/**
 * Returns a color for a given Hz deviation value.
 * Green = in tune, Yellow/Red = out of tune
 */
export function hzToColor(hz: number): string {
  const absHz = Math.abs(hz);
  if (absHz <= HZ_THRESHOLD_PERFECT) return '#00ff88';   // Perfect (green)
  if (absHz <= HZ_THRESHOLD_VERY_GOOD) return '#88ff00'; // Very good (yellow-green)
  if (absHz <= HZ_THRESHOLD_ACCEPTABLE) return '#ffcc00'; // Acceptable (yellow)
  if (absHz <= HZ_THRESHOLD_MARGINAL) return '#ff8800';  // Marginal (orange)
  return '#ff2200';                                        // Out of tune (red)
}
