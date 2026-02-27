// Type Definitions for Handpan Tuning Checker

type HandpanNote = {
    name: string; // name of the note (e.g. "C4")
    frequency: number; // frequency of the note in Hz
};

type HandpanTuning = {
    notes: HandpanNote[]; // array of notes in the tuning
    scale: string; // scale name (e.g. "D minor")
    centerNote?: HandpanNote; // optional center note
    temperament?: string; // optional temperament (e.g. "Equal Temperament")
};

type HandpanInstrument = {
    id: number; // unique identifier for the instrument
    name: string; // name of the instrument
    manufacturer: string; // manufacturer name
    tunings: HandpanTuning[]; // array of tunings available
};

// Example usage
const exampleTuning: HandpanTuning = {
    notes: [
        { name: "C4", frequency: 261.63 },
        { name: "D4", frequency: 293.66 },
        { name: "E4", frequency: 329.63 }
    ],
    scale: "C Major"
};