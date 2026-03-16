export type HandpanNote = {
  note: string;
};

export type HandpanTuning = {
  tuningName: string;
  notes: HandpanNote[];
};

export type HandpanInstrument = {
  name: string;
  tunings: HandpanTuning[];
};

export type TunerData = {
  frequency: number;
  note: HandpanNote;
};

export const exampleTuning: HandpanTuning = {
  tuningName: 'Example Tuning',
  notes: [{ note: 'C' }, { note: 'D' }, { note: 'E' }]
};