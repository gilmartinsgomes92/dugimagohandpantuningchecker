/**
 * Comprehensive handpan scale database.
 * Each entry includes the theoretical music theory name and the
 * commonly-used handpan world name (Kurd, Pygmy, Hijaz, Celtic, etc.).
 * The `pitchClasses` array uses semitone numbers 0–11 (C=0).
 */

export interface HandpanScale {
  /** Theoretical music-theory name, e.g. "D Minor" */
  theoreticalName: string;
  /** Handpan community name, e.g. "Kurd" */
  handpanName: string;
  /** Root note name */
  root: string;
  /** Pitch classes (semitones 0–11) for each note of the scale, starting with the ding */
  pitchClasses: number[];
  /** Friendly note names (enharmonic as typically written in handpan world) */
  notes: string[];
}

// Semitone map: C=0, C#/Db=1, D=2, D#/Eb=3, E=4, F=5, F#/Gb=6, G=7, G#/Ab=8, A=9, A#/Bb=10, B=11
const pc = (name: string): number => {
  const map: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  return map[name] ?? 0;
};

const toPc = (names: string[]): number[] => names.map(pc);

export const HANDPAN_SCALES_DB: HandpanScale[] = [
  // ── D scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'D Minor (Aeolian)',
    handpanName: 'Kurd',
    root: 'D',
    notes: ['D', 'A', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A'],
    pitchClasses: toPc(['D', 'A', 'Bb', 'C', 'D', 'E', 'F', 'G', 'A']),
  },
  {
    theoreticalName: 'D Phrygian',
    handpanName: 'Pygmy',
    root: 'D',
    notes: ['D', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
    pitchClasses: toPc(['D', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']),
  },
  {
    theoreticalName: 'D Harmonic Minor',
    handpanName: 'Celtic Minor',
    root: 'D',
    notes: ['D', 'A', 'Bb', 'C#', 'D', 'E', 'F', 'G', 'A'],
    pitchClasses: toPc(['D', 'A', 'Bb', 'C#', 'D', 'E', 'F', 'G', 'A']),
  },
  {
    theoreticalName: 'D Major',
    handpanName: 'Major',
    root: 'D',
    notes: ['D', 'A', 'B', 'C#', 'D', 'E', 'F#', 'G', 'A'],
    pitchClasses: toPc(['D', 'A', 'B', 'C#', 'D', 'E', 'F#', 'G', 'A']),
  },
  {
    theoreticalName: 'D Dorian',
    handpanName: 'Dorian',
    root: 'D',
    notes: ['D', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'],
    pitchClasses: toPc(['D', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']),
  },
  // ── E scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'E Phrygian',
    handpanName: 'Integral',
    root: 'E',
    notes: ['E', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
    pitchClasses: toPc(['E', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B']),
  },
  {
    theoreticalName: 'E Minor (Aeolian)',
    handpanName: 'Kurd E',
    root: 'E',
    notes: ['E', 'B', 'C', 'D', 'E', 'F#', 'G', 'A', 'B'],
    pitchClasses: toPc(['E', 'B', 'C', 'D', 'E', 'F#', 'G', 'A', 'B']),
  },
  // ── F scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'F Lydian',
    handpanName: 'Sabye',
    root: 'F',
    notes: ['F', 'C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'C'],
    pitchClasses: toPc(['F', 'C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'C']),
  },
  {
    theoreticalName: 'F Dorian',
    handpanName: 'Dorian F',
    root: 'F',
    notes: ['F', 'C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb', 'C'],
    pitchClasses: toPc(['F', 'C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb', 'C']),
  },
  // ── G scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'G Minor (Aeolian)',
    handpanName: 'Kurd G',
    root: 'G',
    notes: ['G', 'D', 'Eb', 'F', 'G', 'A', 'Bb', 'C', 'D'],
    pitchClasses: toPc(['G', 'D', 'Eb', 'F', 'G', 'A', 'Bb', 'C', 'D']),
  },
  {
    theoreticalName: 'G Dorian',
    handpanName: 'Dorian G',
    root: 'G',
    notes: ['G', 'D', 'E', 'F', 'G', 'A', 'Bb', 'C', 'D'],
    pitchClasses: toPc(['G', 'D', 'E', 'F', 'G', 'A', 'Bb', 'C', 'D']),
  },
  {
    theoreticalName: 'G Major',
    handpanName: 'Major G',
    root: 'G',
    notes: ['G', 'D', 'E', 'F#', 'G', 'A', 'B', 'C', 'D'],
    pitchClasses: toPc(['G', 'D', 'E', 'F#', 'G', 'A', 'B', 'C', 'D']),
  },
  // ── A scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'A Minor (Aeolian)',
    handpanName: 'Kurd A',
    root: 'A',
    notes: ['A', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E'],
    pitchClasses: toPc(['A', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']),
  },
  {
    theoreticalName: 'A Dorian',
    handpanName: 'Dorian A',
    root: 'A',
    notes: ['A', 'E', 'F#', 'G', 'A', 'B', 'C', 'D', 'E'],
    pitchClasses: toPc(['A', 'E', 'F#', 'G', 'A', 'B', 'C', 'D', 'E']),
  },
  {
    theoreticalName: 'A Phrygian Dominant',
    handpanName: 'Hijaz',
    root: 'A',
    notes: ['A', 'E', 'F', 'G#', 'A', 'Bb', 'C', 'D', 'E'],
    pitchClasses: toPc(['A', 'E', 'F', 'G#', 'A', 'Bb', 'C', 'D', 'E']),
  },
  {
    theoreticalName: 'A Major',
    handpanName: 'Major A',
    root: 'A',
    notes: ['A', 'E', 'F#', 'G#', 'A', 'B', 'C#', 'D', 'E'],
    pitchClasses: toPc(['A', 'E', 'F#', 'G#', 'A', 'B', 'C#', 'D', 'E']),
  },
  // ── B scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'B Dorian',
    handpanName: 'Dorian B',
    root: 'B',
    notes: ['B', 'F#', 'G#', 'A', 'B', 'C#', 'D', 'E', 'F#'],
    pitchClasses: toPc(['B', 'F#', 'G#', 'A', 'B', 'C#', 'D', 'E', 'F#']),
  },
  {
    theoreticalName: 'B Minor (Aeolian)',
    handpanName: 'Kurd B',
    root: 'B',
    notes: ['B', 'F#', 'G', 'A', 'B', 'C#', 'D', 'E', 'F#'],
    pitchClasses: toPc(['B', 'F#', 'G', 'A', 'B', 'C#', 'D', 'E', 'F#']),
  },
  // ── C scales ──────────────────────────────────────────────────
  {
    theoreticalName: 'C Dorian',
    handpanName: 'Dorian C',
    root: 'C',
    notes: ['C', 'G', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G'],
    pitchClasses: toPc(['C', 'G', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G']),
  },
  {
    theoreticalName: 'C Major',
    handpanName: 'Celtic Major',
    root: 'C',
    notes: ['C', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G'],
    pitchClasses: toPc(['C', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G']),
  },
  {
    theoreticalName: 'C# Minor (Aeolian)',
    handpanName: 'Kurd C#',
    root: 'C#',
    notes: ['C#', 'G#', 'A', 'B', 'C#', 'D#', 'E', 'F#', 'G#'],
    pitchClasses: toPc(['C#', 'G#', 'A', 'B', 'C#', 'D#', 'E', 'F#', 'G#']),
  },
  // ── Eb / F# scales ────────────────────────────────────────────
  {
    theoreticalName: 'Eb Minor (Aeolian)',
    handpanName: 'Kurd Eb',
    root: 'Eb',
    notes: ['Eb', 'Bb', 'B', 'Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb'],
    pitchClasses: toPc(['Eb', 'Bb', 'B', 'Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb']),
  },
  {
    theoreticalName: 'F# Minor (Aeolian)',
    handpanName: 'Kurd F#',
    root: 'F#',
    notes: ['F#', 'C#', 'D', 'E', 'F#', 'G#', 'A', 'B', 'C#'],
    pitchClasses: toPc(['F#', 'C#', 'D', 'E', 'F#', 'G#', 'A', 'B', 'C#']),
  },
];
