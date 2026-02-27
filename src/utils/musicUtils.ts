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

  // Cents deviation from the nearest semitone
  const cents = (midiFloat - midiNote) * 100;

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

/**
 * Calculates the cents deviation between a detected frequency and a reference frequency.
 * Positive = sharp, Negative = flat
 */
export function centsDeviation(detectedFreq: number, referenceFreq: number): number {
  return 1200 * Math.log2(detectedFreq / referenceFreq);
}

/**
 * Formats a cents value for display with sign and one decimal place.
 */
export function formatCents(cents: number): string {
  const sign = cents >= 0 ? '+' : '';
  return `${sign}${cents.toFixed(1)}¢`;
}

/**
 * Returns a color for a given cents deviation value.
 * Green = in tune, Yellow/Red = out of tune
 */
export function centsToColor(cents: number): string {
  const absCents = Math.abs(cents);
  if (absCents <= 2) return '#00ff88';   // Perfect (green)
  if (absCents <= 5) return '#88ff00';   // Very good (yellow-green)
  if (absCents <= 10) return '#ffcc00';  // Acceptable (yellow)
  if (absCents <= 20) return '#ff8800';  // Marginal (orange)
  return '#ff2200';                       // Out of tune (red)
}
