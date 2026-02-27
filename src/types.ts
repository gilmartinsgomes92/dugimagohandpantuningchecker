// TypeScript definitions for handpan-related types

export type HandpanNote = {
    name: string;
    frequency: number;
};

export type HandpanTuning = {
    name: string;
    notes: HandpanNote[];
};

export type HandpanInstrument = {
    id: string;
    name: string;
    tuning: HandpanTuning;
};

export type TunerData = {
    pitch: number;
    deviation: number;
    timestamp: Date;
};
