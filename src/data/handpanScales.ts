/**
 * Comprehensive handpan scale database.
 * Each entry includes the theoretical music theory name, the commonly-used
 * handpan world name (Kurd, Pygmy, Hijaz, Sabye, etc.), the root note,
 * typical 9-note handpan layout (ding + 8 tone fields), and pitch classes.
 *
 * Pitch classes: C=0, C#/Db=1, D=2, Eb/D#=3, E=4, F=5, F#/Gb=6,
 *                G=7, Ab/G#=8, A=9, Bb/A#=10, B=11
 */

export interface HandpanScale {
  /** Theoretical music-theory name, e.g. "D Natural Minor (Aeolian)" */
  theoreticalName: string;
  /** Handpan community name, e.g. "Kurd" */
  handpanName: string;
  /** Root note name */
  root: string;
  /** Pitch classes (semitones 0–11) for each note of the 9-note layout */
  pitchClasses: number[];
  /** Friendly note names in the typical handpan (ding + tone fields) order */
  notes: string[];
}

const PC_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
const toPc = (names: string[]): number[] => names.map(n => PC_MAP[n] ?? 0);

/**
 * Build a HandpanScale from 7 ordered note names (root → 7th).
 * Produces the standard 9-note handpan layout:
 *   [root, 5th, 6th, 7th, root, 2nd, 3rd, 4th, 5th]
 */
function s7(
  theoreticalName: string,
  handpanName: string,
  root: string,
  scale: [string, string, string, string, string, string, string],
): HandpanScale {
  const [r, n2, n3, n4, n5, n6, n7] = scale;
  const notes = [r, n5, n6, n7, r, n2, n3, n4, n5];
  return { theoreticalName, handpanName, root, notes, pitchClasses: toPc(notes) };
}

/**
 * Build a HandpanScale from 5 minor-pentatonic note names
 * [root, b3, 4, 5, b7].
 * 9-note layout: [root, 5, b7, root, b3, 4, 5, b7, root]
 */
function s5m(
  theoreticalName: string,
  handpanName: string,
  root: string,
  scale: [string, string, string, string, string],
): HandpanScale {
  const [r, n2, n3, n4, n5] = scale;
  const notes = [r, n4, n5, r, n2, n3, n4, n5, r];
  return { theoreticalName, handpanName, root, notes, pitchClasses: toPc(notes) };
}

/**
 * Build a HandpanScale from 5 major-pentatonic note names
 * [root, 2, 3, 5, 6].
 * 9-note layout: [root, 5, 6, root, 2, 3, 5, 6, root]
 */
function s5M(
  theoreticalName: string,
  handpanName: string,
  root: string,
  scale: [string, string, string, string, string],
): HandpanScale {
  const [r, n2, n3, n4, n5] = scale;
  const notes = [r, n4, n5, r, n2, n3, n4, n5, r];
  return { theoreticalName, handpanName, root, notes, pitchClasses: toPc(notes) };
}

export const HANDPAN_SCALES_DB: HandpanScale[] = [

  // ── NATURAL MINOR / AEOLIAN (Kurd family) ─────────────────────────────────
  // [root, 2, b3, 4, 5, b6, b7]
  s7('C Natural Minor (Aeolian)',  'Kurd C',    'C',  ['C',  'D',  'Eb', 'F',  'G',  'Ab', 'Bb']),
  s7('C# Natural Minor (Aeolian)', 'Kurd C#',   'C#', ['C#', 'D#', 'E',  'F#', 'G#', 'A',  'B' ]),
  s7('D Natural Minor (Aeolian)',  'Kurd',      'D',  ['D',  'E',  'F',  'G',  'A',  'Bb', 'C' ]),
  s7('Eb Natural Minor (Aeolian)', 'Kurd Eb',   'Eb', ['Eb', 'F',  'Gb', 'Ab', 'Bb', 'B',  'Db']),
  s7('E Natural Minor (Aeolian)',  'Kurd E',    'E',  ['E',  'F#', 'G',  'A',  'B',  'C',  'D' ]),
  s7('F Natural Minor (Aeolian)',  'Kurd F',    'F',  ['F',  'G',  'Ab', 'Bb', 'C',  'Db', 'Eb']),
  s7('F# Natural Minor (Aeolian)', 'Kurd F#',   'F#', ['F#', 'G#', 'A',  'B',  'C#', 'D',  'E' ]),
  s7('G Natural Minor (Aeolian)',  'Kurd G',    'G',  ['G',  'A',  'Bb', 'C',  'D',  'Eb', 'F' ]),
  s7('Ab Natural Minor (Aeolian)', 'Kurd Ab',   'Ab', ['Ab', 'Bb', 'B',  'Db', 'Eb', 'E',  'Gb']),
  s7('A Natural Minor (Aeolian)',  'Kurd A',    'A',  ['A',  'B',  'C',  'D',  'E',  'F',  'G' ]),
  s7('Bb Natural Minor (Aeolian)', 'Kurd Bb',   'Bb', ['Bb', 'C',  'Db', 'Eb', 'F',  'Gb', 'Ab']),
  s7('B Natural Minor (Aeolian)',  'Kurd B',    'B',  ['B',  'C#', 'D',  'E',  'F#', 'G',  'A' ]),

  // ── DORIAN ────────────────────────────────────────────────────────────────
  // [root, 2, b3, 4, 5, 6, b7]  — major 6th distinguishes from Aeolian
  s7('C Dorian',  'Dorian C',  'C',  ['C',  'D',  'Eb', 'F',  'G',  'A',  'Bb']),
  s7('C# Dorian', 'Dorian C#', 'C#', ['C#', 'D#', 'E',  'F#', 'G#', 'A#', 'B' ]),
  s7('D Dorian',  'Dorian',    'D',  ['D',  'E',  'F',  'G',  'A',  'B',  'C' ]),
  s7('Eb Dorian', 'Dorian Eb', 'Eb', ['Eb', 'F',  'Gb', 'Ab', 'Bb', 'C',  'Db']),
  s7('E Dorian',  'Dorian E',  'E',  ['E',  'F#', 'G',  'A',  'B',  'C#', 'D' ]),
  s7('F Dorian',  'Dorian F',  'F',  ['F',  'G',  'Ab', 'Bb', 'C',  'D',  'Eb']),
  s7('F# Dorian', 'Dorian F#', 'F#', ['F#', 'G#', 'A',  'B',  'C#', 'D#', 'E' ]),
  s7('G Dorian',  'Dorian G',  'G',  ['G',  'A',  'Bb', 'C',  'D',  'E',  'F' ]),
  s7('Ab Dorian', 'Dorian Ab', 'Ab', ['Ab', 'Bb', 'B',  'Db', 'Eb', 'F',  'Gb']),
  s7('A Dorian',  'Dorian A',  'A',  ['A',  'B',  'C',  'D',  'E',  'F#', 'G' ]),
  s7('Bb Dorian', 'Dorian Bb', 'Bb', ['Bb', 'C',  'Db', 'Eb', 'F',  'G',  'Ab']),
  s7('B Dorian',  'Dorian B',  'B',  ['B',  'C#', 'D',  'E',  'F#', 'G#', 'A' ]),

  // ── PHRYGIAN (Pygmy / Integral family) ───────────────────────────────────
  // [root, b2, b3, 4, 5, b6, b7]  — minor 2nd is the defining interval
  s7('C Phrygian',  'Phrygian C',  'C',  ['C',  'Db', 'Eb', 'F',  'G',  'Ab', 'Bb']),
  s7('D Phrygian',  'Pygmy',       'D',  ['D',  'Eb', 'F',  'G',  'A',  'Bb', 'C' ]),
  s7('E Phrygian',  'Integral',    'E',  ['E',  'F',  'G',  'A',  'B',  'C',  'D' ]),
  s7('F Phrygian',  'Phrygian F',  'F',  ['F',  'Gb', 'Ab', 'Bb', 'C',  'Db', 'Eb']),
  s7('G Phrygian',  'Phrygian G',  'G',  ['G',  'Ab', 'Bb', 'C',  'D',  'Eb', 'F' ]),
  s7('A Phrygian',  'Phrygian A',  'A',  ['A',  'Bb', 'C',  'D',  'E',  'F',  'G' ]),
  s7('Bb Phrygian', 'Phrygian Bb', 'Bb', ['Bb', 'B',  'Db', 'Eb', 'F',  'Gb', 'Ab']),
  s7('B Phrygian',  'Phrygian B',  'B',  ['B',  'C',  'D',  'E',  'F#', 'G',  'A' ]),

  // ── HARMONIC MINOR (Celtic Minor family) ──────────────────────────────────
  // [root, 2, b3, 4, 5, b6, 7]  — raised (major) 7th over minor 6th
  s7('C Harmonic Minor',  'Equinox / Celtic Minor C', 'C',  ['C',  'D',  'Eb', 'F',  'G',  'Ab', 'B' ]),
  s7('D Harmonic Minor',  'Celtic Minor',             'D',  ['D',  'E',  'F',  'G',  'A',  'Bb', 'C#']),
  s7('E Harmonic Minor',  'Harmonic Minor E',         'E',  ['E',  'F#', 'G',  'A',  'B',  'C',  'D#']),
  s7('F Harmonic Minor',  'Harmonic Minor F',         'F',  ['F',  'G',  'Ab', 'Bb', 'C',  'Db', 'E' ]),
  s7('G Harmonic Minor',  'Harmonic Minor G',         'G',  ['G',  'A',  'Bb', 'C',  'D',  'Eb', 'F#']),
  s7('A Harmonic Minor',  'Harmonic Minor A',         'A',  ['A',  'B',  'C',  'D',  'E',  'F',  'G#']),
  s7('B Harmonic Minor',  'Harmonic Minor B',         'B',  ['B',  'C#', 'D',  'E',  'F#', 'G',  'A#']),
  s7('C# Harmonic Minor', 'Harmonic Minor C#',        'C#', ['C#', 'D#', 'E',  'F#', 'G#', 'A',  'C' ]),

  // ── PHRYGIAN DOMINANT / HIJAZ ─────────────────────────────────────────────
  // [root, b2, 3, 4, 5, b6, b7]  — 5th mode of Harmonic Minor; aug 2nd between b2 and 3
  s7('D Phrygian Dominant',  'Hijaz D',   'D',  ['D',  'Eb', 'F#', 'G',  'A',  'Bb', 'C' ]),
  s7('E Phrygian Dominant',  'Hijaz E',   'E',  ['E',  'F',  'G#', 'A',  'B',  'C',  'D' ]),
  s7('F Phrygian Dominant',  'Hijaz F',   'F',  ['F',  'Gb', 'A',  'Bb', 'C',  'Db', 'Eb']),
  s7('G Phrygian Dominant',  'Hijaz G',   'G',  ['G',  'Ab', 'B',  'C',  'D',  'Eb', 'F' ]),
  s7('A Phrygian Dominant',  'Hijaz',     'A',  ['A',  'Bb', 'C#', 'D',  'E',  'F',  'G' ]),
  s7('B Phrygian Dominant',  'Hijaz B',   'B',  ['B',  'C',  'D#', 'E',  'F#', 'G',  'A' ]),
  s7('C Phrygian Dominant',  'Hijaz C',   'C',  ['C',  'Db', 'E',  'F',  'G',  'Ab', 'Bb']),
  s7('F# Phrygian Dominant', 'Hijaz F#',  'F#', ['F#', 'G',  'A#', 'B',  'C#', 'D',  'E' ]),

  // ── MAJOR / IONIAN ────────────────────────────────────────────────────────
  // [root, 2, 3, 4, 5, 6, 7]
  s7('C Major',   'Celtic Major',  'C',  ['C',  'D',  'E',  'F',  'G',  'A',  'B' ]),
  s7('D Major',   'Major D',       'D',  ['D',  'E',  'F#', 'G',  'A',  'B',  'C#']),
  s7('E Major',   'Major E',       'E',  ['E',  'F#', 'G#', 'A',  'B',  'C#', 'D#']),
  s7('F Major',   'Major F',       'F',  ['F',  'G',  'A',  'Bb', 'C',  'D',  'E' ]),
  s7('G Major',   'Major G',       'G',  ['G',  'A',  'B',  'C',  'D',  'E',  'F#']),
  s7('Ab Major',  'Major Ab',      'Ab', ['Ab', 'Bb', 'C',  'Db', 'Eb', 'F',  'G' ]),
  s7('A Major',   'Major A',       'A',  ['A',  'B',  'C#', 'D',  'E',  'F#', 'G#']),
  s7('Bb Major',  'Major Bb',      'Bb', ['Bb', 'C',  'D',  'Eb', 'F',  'G',  'A' ]),
  s7('B Major',   'Major B',       'B',  ['B',  'C#', 'D#', 'E',  'F#', 'G#', 'A#']),

  // ── MIXOLYDIAN ────────────────────────────────────────────────────────────
  // [root, 2, 3, 4, 5, 6, b7]  — major scale with flattened 7th
  s7('C Mixolydian',  'Celtic Mixolydian C', 'C',  ['C',  'D',  'E',  'F',  'G',  'A',  'Bb']),
  s7('D Mixolydian',  'Mixolydian D',        'D',  ['D',  'E',  'F#', 'G',  'A',  'B',  'C' ]),
  s7('E Mixolydian',  'Mixolydian E',        'E',  ['E',  'F#', 'G#', 'A',  'B',  'C#', 'D' ]),
  s7('F Mixolydian',  'Mixolydian F',        'F',  ['F',  'G',  'A',  'Bb', 'C',  'D',  'Eb']),
  s7('G Mixolydian',  'Mixolydian G',        'G',  ['G',  'A',  'B',  'C',  'D',  'E',  'F' ]),
  s7('A Mixolydian',  'Mixolydian A',        'A',  ['A',  'B',  'C#', 'D',  'E',  'F#', 'G' ]),
  s7('Bb Mixolydian', 'Mixolydian Bb',       'Bb', ['Bb', 'C',  'D',  'Eb', 'F',  'G',  'Ab']),

  // ── LYDIAN ────────────────────────────────────────────────────────────────
  // [root, 2, 3, #4, 5, 6, 7]  — raised (augmented) 4th is the signature
  s7('C Lydian',  'Lydian C',  'C',  ['C',  'D',  'E',  'F#', 'G',  'A',  'B' ]),
  s7('D Lydian',  'Lydian D',  'D',  ['D',  'E',  'F#', 'G#', 'A',  'B',  'C#']),
  s7('E Lydian',  'Lydian E',  'E',  ['E',  'F#', 'G#', 'A#', 'B',  'C#', 'D#']),
  s7('F Lydian',  'Sabye',     'F',  ['F',  'G',  'A',  'B',  'C',  'D',  'E' ]),
  s7('G Lydian',  'Lydian G',  'G',  ['G',  'A',  'B',  'C#', 'D',  'E',  'F#']),
  s7('A Lydian',  'Lydian A',  'A',  ['A',  'B',  'C#', 'D#', 'E',  'F#', 'G#']),
  s7('Bb Lydian', 'Lydian Bb', 'Bb', ['Bb', 'C',  'D',  'E',  'F',  'G',  'A' ]),

  // ── DOUBLE HARMONIC MAJOR (Mystic / Byzantine / Gypsy) ────────────────────
  // [root, b2, 3, 4, 5, b6, 7]  — two augmented 2nds give its exotic character
  s7('D Double Harmonic Major', 'Mystic D',  'D',  ['D',  'Eb', 'F#', 'G',  'A',  'Bb', 'C#']),
  s7('E Double Harmonic Major', 'Mystic E',  'E',  ['E',  'F',  'G#', 'A',  'B',  'C',  'D#']),
  s7('G Double Harmonic Major', 'Mystic G',  'G',  ['G',  'Ab', 'B',  'C',  'D',  'Eb', 'F#']),
  s7('A Double Harmonic Major', 'Oxalis',    'A',  ['A',  'Bb', 'C#', 'D',  'E',  'F',  'G#']),

  // ── MELODIC MINOR (Jazz Minor) ────────────────────────────────────────────
  // [root, 2, b3, 4, 5, 6, 7]  — natural minor with raised 6th and 7th
  s7('C Melodic Minor', 'Melodic Minor C', 'C',  ['C',  'D',  'Eb', 'F',  'G',  'A',  'B' ]),
  s7('D Melodic Minor', 'Melodic Minor D', 'D',  ['D',  'E',  'F',  'G',  'A',  'B',  'C#']),
  s7('E Melodic Minor', 'Melodic Minor E', 'E',  ['E',  'F#', 'G',  'A',  'B',  'C#', 'D#']),
  s7('G Melodic Minor', 'Melodic Minor G', 'G',  ['G',  'A',  'Bb', 'C',  'D',  'E',  'F#']),
  s7('A Melodic Minor', 'Melodic Minor A', 'A',  ['A',  'B',  'C',  'D',  'E',  'F#', 'G#']),

  // ── MINOR PENTATONIC ──────────────────────────────────────────────────────
  // [root, b3, 4, 5, b7]
  s5m('C Minor Pentatonic', 'Pentatonic Minor C', 'C',  ['C', 'Eb', 'F',  'G',  'Bb']),
  s5m('D Minor Pentatonic', 'Pentatonic Minor D', 'D',  ['D', 'F',  'G',  'A',  'C' ]),
  s5m('E Minor Pentatonic', 'Pentatonic Minor E', 'E',  ['E', 'G',  'A',  'B',  'D' ]),
  s5m('G Minor Pentatonic', 'Pentatonic Minor G', 'G',  ['G', 'Bb', 'C',  'D',  'F' ]),
  s5m('A Minor Pentatonic', 'Pentatonic Minor A', 'A',  ['A', 'C',  'D',  'E',  'G' ]),

  // ── MAJOR PENTATONIC ──────────────────────────────────────────────────────
  // [root, 2, 3, 5, 6]
  s5M('C Major Pentatonic', 'Pentatonic Major C', 'C',  ['C', 'D',  'E',  'G',  'A'  ]),
  s5M('D Major Pentatonic', 'Pentatonic Major D', 'D',  ['D', 'E',  'F#', 'A',  'B'  ]),
  s5M('E Major Pentatonic', 'Pentatonic Major E', 'E',  ['E', 'F#', 'G#', 'B',  'C#' ]),
  s5M('G Major Pentatonic', 'Pentatonic Major G', 'G',  ['G', 'A',  'B',  'D',  'E'  ]),
  s5M('A Major Pentatonic', 'Pentatonic Major A', 'A',  ['A', 'B',  'C#', 'E',  'F#' ]),

  // ── SPECIAL / NAMED HANDPAN SCALES ────────────────────────────────────────
  // Annaziska: Eb Mixolydian b6 (Hindu scale) — Eb, F, G, Ab, Bb, B, Db
  s7('Eb Mixolydian b6 (Hindu)', 'Annaziska', 'Eb', ['Eb', 'F', 'G', 'Ab', 'Bb', 'B', 'Db']),

  // Freygish / Harmonic Phrygian — Phrygian with raised 7th (b2, b3, 4, 5, b6, maj7)
  // This is what handpan makers sometimes label "Hijaz" in the traditional Middle-Eastern sense
  s7('A Harmonic Phrygian (Freygish)', 'Freygish / Hijaz A', 'A', ['A', 'Bb', 'C', 'D', 'E', 'F', 'G#']),
  s7('D Harmonic Phrygian (Freygish)', 'Freygish D',         'D', ['D', 'Eb', 'F', 'G', 'A', 'Bb', 'C#']),
];
