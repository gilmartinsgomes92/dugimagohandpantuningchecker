export type HandpanScaleDef = {
  /** Primary community / handpan-market name shown in the UI. */
  sceneName: string;
  /** Alternative community names / aliases. */
  sceneAliases?: string[];
  /** Theoretical / academic label. */
  theoreticalName: string;
  /** Full note names including octave, e.g. "D3", "A3", "Bb3". */
  notes: string[];
};

const PREFERRED_PITCH_CLASSES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

type PitchClass = typeof PREFERRED_PITCH_CLASSES[number];

const ROOTS: PitchClass[] = [...PREFERRED_PITCH_CLASSES];

function noteToAbsolute(pc: PitchClass, octave: number): number {
  return octave * 12 + PREFERRED_PITCH_CLASSES.indexOf(pc);
}

function absoluteToNote(abs: number): string {
  const octave = Math.floor(abs / 12);
  const pitchClass = PREFERRED_PITCH_CLASSES[((abs % 12) + 12) % 12];
  return `${pitchClass}${octave}`;
}

function buildLayout(root: PitchClass, rootOctave: number, semitoneOffsets: readonly number[]): string[] {
  const rootAbs = noteToAbsolute(root, rootOctave);
  return semitoneOffsets.map((offset) => absoluteToNote(rootAbs + offset));
}

function createFamilyEntries(args: {
  sceneName: string;
  sceneAliases?: string[];
  theoreticalNameForRoot: (root: PitchClass) => string;
  semitoneOffsets: readonly number[];
  rootOctave?: number;
}): HandpanScaleDef[] {
  const { sceneName, sceneAliases, theoreticalNameForRoot, semitoneOffsets, rootOctave = 3 } = args;

  return ROOTS.map((root) => ({
    sceneName,
    sceneAliases,
    theoreticalName: theoreticalNameForRoot(root),
    notes: buildLayout(root, rootOctave, semitoneOffsets),
  }));
}

const FULL_MODE_LAYOUTS = {
  ionian: [0, 7, 9, 11, 12, 14, 16, 17, 19],
  aeolian: [0, 7, 8, 10, 12, 14, 15, 17, 19],
  dorian: [0, 7, 9, 10, 12, 14, 15, 17, 19],
  phrygian: [0, 7, 8, 10, 12, 13, 15, 17, 19],
  lydian: [0, 7, 9, 11, 12, 14, 16, 18, 19],
  mixolydian: [0, 7, 9, 10, 12, 14, 16, 17, 19],
  locrian: [0, 6, 8, 10, 12, 13, 15, 17, 18],
} as const;

const HANDPAN_SCENE_LAYOUTS = {
  kurdAeolian: [0, 7, 8, 10, 12, 14, 15, 17, 19],
  celticMinorAmara: [0, 7, 10, 12, 14, 15, 17, 19, 22],
  // Common scene names that share essentially the same pitch collection in this matcher.
  // Since the scale identifier currently matches by pitch-class set, we surface them as aliases
  // so the result is stable even when players strike notes in any order.
  integralEquinox: [0, 7, 8, 10, 12, 14, 15, 19, 22],
  pygmyMagicVoyage: [0, 2, 3, 7, 10, 12, 14, 15, 19],
  laSirena: [0, 3, 7, 9, 10, 12, 14, 15, 19],
  hijazPhrygianDominant: [0, 7, 8, 10, 12, 13, 16, 17, 19],
  hijazHarmonicMinor: [0, 7, 8, 11, 12, 14, 15, 17, 19],
  akebono: [0, 5, 7, 8, 12, 13, 17, 19, 20],
  sabye: [0, 5, 7, 9, 11, 12, 14, 16, 19],
  yshaSavita: [0, 7, 11, 12, 14, 16, 17, 19, 24],
} as const;

const THEORETICAL_FAMILIES: HandpanScaleDef[] = [
  ...createFamilyEntries({
    sceneName: 'Major',
    sceneAliases: ['Ionian'],
    theoreticalNameForRoot: (root) => `${root} Major / Ionian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.ionian,
  }),
  ...createFamilyEntries({
    sceneName: 'Natural Minor',
    sceneAliases: ['Aeolian'],
    theoreticalNameForRoot: (root) => `${root} Natural Minor / Aeolian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.aeolian,
  }),
  ...createFamilyEntries({
    sceneName: 'Dorian',
    theoreticalNameForRoot: (root) => `${root} Dorian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.dorian,
  }),
  ...createFamilyEntries({
    sceneName: 'Phrygian',
    theoreticalNameForRoot: (root) => `${root} Phrygian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.phrygian,
  }),
  ...createFamilyEntries({
    sceneName: 'Lydian',
    theoreticalNameForRoot: (root) => `${root} Lydian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.lydian,
  }),
  ...createFamilyEntries({
    sceneName: 'Mixolydian',
    theoreticalNameForRoot: (root) => `${root} Mixolydian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.mixolydian,
  }),
  ...createFamilyEntries({
    sceneName: 'Locrian',
    theoreticalNameForRoot: (root) => `${root} Locrian`,
    semitoneOffsets: FULL_MODE_LAYOUTS.locrian,
  }),
  ...createFamilyEntries({
    sceneName: 'Major Pentatonic',
    theoreticalNameForRoot: (root) => `${root} Major Pentatonic`,
    semitoneOffsets: [0, 7, 9, 12, 14, 16, 19, 21, 24],
  }),
  ...createFamilyEntries({
    sceneName: 'Minor Pentatonic',
    theoreticalNameForRoot: (root) => `${root} Minor Pentatonic`,
    semitoneOffsets: [0, 7, 10, 12, 15, 17, 19, 22, 24],
  }),
  ...createFamilyEntries({
    sceneName: 'Harmonic Minor',
    theoreticalNameForRoot: (root) => `${root} Harmonic Minor`,
    semitoneOffsets: [0, 7, 8, 11, 12, 14, 15, 17, 19],
  }),
  ...createFamilyEntries({
    sceneName: 'Melodic Minor',
    theoreticalNameForRoot: (root) => `${root} Melodic Minor`,
    semitoneOffsets: [0, 7, 9, 10, 12, 14, 15, 17, 19],
  }),
  ...createFamilyEntries({
    sceneName: 'Chromatic',
    theoreticalNameForRoot: (root) => `${root} Chromatic`,
    semitoneOffsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  }),
];

const HANDPAN_SCENE_FAMILIES: HandpanScaleDef[] = [
  ...createFamilyEntries({
    sceneName: 'Kurd',
    sceneAliases: ['Aeolian', 'Annaziska'],
    theoreticalNameForRoot: (root) => `${root} Natural Minor / Aeolian`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.kurdAeolian,
  }),
  ...createFamilyEntries({
    sceneName: 'Celtic Minor',
    sceneAliases: ['Amara'],
    theoreticalNameForRoot: (root) => `${root} Minor Hexatonic (no 6th)`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.celticMinorAmara,
  }),
  ...createFamilyEntries({
    sceneName: 'Pygmy',
    sceneAliases: ['Magic Voyage', 'Magic Travel', 'Voyage'],
    theoreticalNameForRoot: (root) => `${root} Minor Pentatonic / Voyage Variant`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.pygmyMagicVoyage,
  }),
  ...createFamilyEntries({
    sceneName: 'Integral',
    sceneAliases: ['Equinox'],
    theoreticalNameForRoot: (root) => `${root} Natural Minor Hexatonic (no 4th)`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.integralEquinox,
  }),
  ...createFamilyEntries({
    sceneName: 'La Sirena',
    theoreticalNameForRoot: (root) => `${root} Dorian Hexatonic (no 4th)`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.laSirena,
  }),
  ...createFamilyEntries({
    sceneName: 'Hijaz',
    sceneAliases: ['Phrygian Dominant'],
    theoreticalNameForRoot: (root) => `${root} Phrygian Dominant`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.hijazPhrygianDominant,
  }),
  ...createFamilyEntries({
    sceneName: 'Hijaz',
    sceneAliases: ['Harmonic Minor'],
    theoreticalNameForRoot: (root) => `${root} Harmonic Minor`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.hijazHarmonicMinor,
  }),
  ...createFamilyEntries({
    sceneName: 'Akebono',
    theoreticalNameForRoot: (root) => `${root} Akebono / In Pentatonic Variant`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.akebono,
  }),
  ...createFamilyEntries({
    sceneName: 'Sabye',
    sceneAliases: ['SabyeD'],
    theoreticalNameForRoot: (root) => `${root} Major / Ionian`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.sabye,
  }),
  ...createFamilyEntries({
    sceneName: 'Ysha Savita',
    sceneAliases: ['YshaSavita', 'Yisha Savita'],
    theoreticalNameForRoot: (root) => `${root} Major Hexatonic / Ysha Savita Variant`,
    semitoneOffsets: HANDPAN_SCENE_LAYOUTS.yshaSavita,
  }),
];

function dedupeScales(scales: HandpanScaleDef[]): HandpanScaleDef[] {
  const seen = new Set<string>();
  const deduped: HandpanScaleDef[] = [];

  for (const scale of scales) {
    const key = [
      scale.sceneName,
      (scale.sceneAliases ?? []).join('|'),
      scale.theoreticalName,
      scale.notes.join(','),
    ].join('::');

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(scale);
  }

  return deduped;
}

/**
 * Scale library used by the Scale Identify page.
 *
 * The library intentionally combines:
 * 1) broad theoretical families (Major, Minor, Dorian, etc.)
 * 2) common handpan scene names / variants
 *
 * Note: some scene names are represented as aliases because the current matcher
 * identifies scales by pitch-class set, not by physical note layout on the instrument.
 */
export const HANDPAN_SCALE_LIBRARY: HandpanScaleDef[] = dedupeScales([
  ...HANDPAN_SCENE_FAMILIES,
  ...THEORETICAL_FAMILIES,
]);
