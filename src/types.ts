// TypeScript type definitions for handpan tuning checker app

// Represents a tuning note for a handpan
interface TuningNote {
    note: string; // The musical note (e.g., "C", "D#")
    frequency: number; // Frequency of the note in Hz
    duration?: number; // Duration in seconds, optional
}

// Represents a handpan instrument
interface Handpan {
    id: number; // Unique identifier for the handpan
    model: string; // The model name of the handpan
    scale: string; // The scale of the handpan (e.g., "C minor")
    notes: TuningNote[]; // Array of notes in the handpan
}

// Represents a tuning result
interface TuningResult {
    handpan: Handpan; // The handpan being tuned
    matchedNotes: TuningNote[]; // Notes that match the expected tuning
    missingNotes: TuningNote[]; // Notes that are missing in the current tuning
    isTuned: boolean; // Whether the handpan is correctly tuned
}

// Represents a user
interface User {
    id: number; // Unique identifier for the user
    name: string; // Full name of the user
    email: string; // Email address of the user
    ownedHandpans: Handpan[]; // Array of handpans owned by the user
}