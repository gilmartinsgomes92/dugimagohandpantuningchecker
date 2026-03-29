export type HandpanScaleDef = {
  /** Community / handpan-market name (temporary family label until scene aliases are added). */
  sceneName: string;
  /** Theoretical / academic label. */
  theoreticalName: string;
  /** Full note names including octave, e.g. "D3", "A3", "Bb3". */
  notes: string[];
};

type ScalePattern = {
  sceneName: string;
  labelSuffix: string;
  intervals: number[];
};

/**
 * Preferred accidentals for this app.
 *
 * We intentionally normalize enharmonics to this mixed spelling set so the scale
 * identifier treats Db=C#, Eb=D#, Ab=G#, Bb=A#, while keeping F# as F#.
 */
const PREFERRED_PITCH_CLASSES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const ENHARMONIC_TO_PREFERRED: Record<string, (typeof PREFERRED_PITCH_CLASSES)[number]> = {
  C: 'C',
  'B#': 'C',
  Db: 'Db',
  'C#': 'Db',
  D: 'D',
  Eb: 'Eb',
  'D#': 'Eb',
  E: 'E',
  Fb: 'E',
  F: 'F',
  'E#': 'F',
  'F#': 'F#',
  Gb: 'F#',
  G: 'G',
  Ab: 'Ab',
  'G#': 'Ab',
  A: 'A',
  Bb: 'Bb',
  'A#': 'Bb',
  B: 'B',
  Cb: 'B',
};

const SCALE_PATTERNS: ScalePattern[] = [
  {
    sceneName: 'Chromatic',
    labelSuffix: 'Chromatic',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  {
    sceneName: 'Major / Ionian',
    labelSuffix: 'Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  {
    sceneName: 'Minor / Aeolian',
    labelSuffix: 'Natural Minor (Aeolian)',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    sceneName: 'Dorian',
    labelSuffix: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  {
    sceneName: 'Phrygian',
    labelSuffix: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  {
    sceneName: 'Lydian',
    labelSuffix: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
  },
  {
    sceneName: 'Mixolydian',
    labelSuffix: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  {
    sceneName: 'Locrian',
    labelSuffix: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
  },
  {
    sceneName: 'Major Pentatonic',
    labelSuffix: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
  },
  {
    sceneName: 'Minor Pentatonic',
    labelSuffix: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
  },
  {
    sceneName: 'Harmonic Minor',
    labelSuffix: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  {
    sceneName: 'Melodic Minor',
    labelSuffix: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
  },
];

function preferredPitchClass(note: string): (typeof PREFERRED_PITCH_CLASSES)[number] {
  return ENHARMONIC_TO_PREFERRED[note] ?? 'C';
}

function midiToPreferredNoteName(midi: number): string {
  const pitchClassIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PREFERRED_PITCH_CLASSES[pitchClassIndex]}${octave}`;
}

function buildScaleNotes(rootPitchClass: (typeof PREFERRED_PITCH_CLASSES)[number], intervals: number[]): string[] {
  const rootIndex = PREFERRED_PITCH_CLASSES.indexOf(rootPitchClass);
  const rootMidi = 48 + rootIndex; // C3 = MIDI 48
  return intervals.map((interval) => midiToPreferredNoteName(rootMidi + interval));
}

function buildScale(rootPitchClass: (typeof PREFERRED_PITCH_CLASSES)[number], pattern: ScalePattern): HandpanScaleDef {
  return {
    sceneName: pattern.sceneName,
    theoreticalName: `${rootPitchClass} ${pattern.labelSuffix}`,
    notes: buildScaleNotes(rootPitchClass, pattern.intervals),
  };
}

/**
 * Scale library used by the Scale Identify page.
 *
 * IMPORTANT:
 * - This file is intentionally separate from the existing HANDPAN_SCALES used elsewhere,
 *   so Quick Tuning / Guided flows are not affected.
 * - Scene names are temporary family labels for now.
 * - Later we can add handpan-scene aliases like Kurd, Annaziska, Pygmy, etc.
 */
export const HANDPAN_SCALE_LIBRARY: HandpanScaleDef[] = PREFERRED_PITCH_CLASSES.flatMap((root) =>
  SCALE_PATTERNS.map((pattern) => buildScale(root, pattern)),
);

export { PREFERRED_PITCH_CLASSES, preferredPitchClass };
