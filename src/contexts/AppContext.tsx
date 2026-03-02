/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';

export interface TuningResult {
  noteName: string;
  targetFrequency: number;
  detectedFrequency: number | null;
  cents: number | null;
  status: 'in-tune' | 'slightly-out-of-tune' | 'out-of-tune' | 'skipped' | 'pending';
  compoundFifthFreq?: number;
  compoundFifthCents?: number;
  octaveFreq?: number;
  octaveCents?: number;
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export interface DetectedNotePayload {
  name: string;
  frequency: number;
  /** Octave partial frequency (2× fundamental). Used by the 2-step tuning flow. */
  octave?: number;
  /** Compound-fifth partial frequency (3× fundamental). Used by the 2-step tuning flow. */
  compoundFifth?: number;
  /** @deprecated Use `octave` instead. Kept for backward compatibility. */
  octaveFrequency?: number;
  /** @deprecated Use `compoundFifth` instead. Kept for backward compatibility. */
  compoundFifthFrequency?: number;
}

export type TuningPhase = 'idle' | 'identification' | 'strobe-measurement' | 'results' | 'complete';

interface AppState {
  selectedScale: string | null;
  tuningResults: TuningResult[];
  contactInfo: ContactInfo;
  currentNoteIndex: number;
  notesCount: number | null;
  detectedNote: DetectedNotePayload | null;
  /** Current phase of the guided 2-step tuning workflow. */
  phase: TuningPhase;
}

type AppAction =
  | { type: 'SET_SCALE'; payload: string }
  | { type: 'SET_NOTES_COUNT'; payload: number }
  | { type: 'ADD_TUNING_RESULT'; payload: TuningResult }
  | { type: 'SET_CONTACT_INFO'; payload: Partial<ContactInfo> }
  | { type: 'SET_CURRENT_NOTE_INDEX'; payload: number }
  | { type: 'SET_DETECTED_NOTE'; payload: DetectedNotePayload }
  | { type: 'RESET_EVALUATION' }
  // ── 2-step tuning workflow ──────────────────────────────────────────────────
  | { type: 'START_TUNING_SESSION'; payload: { notesCount: number } }
  | { type: 'MOVE_TO_IDENTIFICATION' }
  | { type: 'MOVE_TO_STROBE_MEASUREMENT' }
  | { type: 'MOVE_TO_RESULTS' }
  | { type: 'CLEAR_DETECTED_NOTE' }
  | {
      type: 'RECORD_MEASUREMENT';
      payload: {
        fundamentalCents: number | null;
        octaveCents: number | null;
        compoundFifthCents: number | null;
        frequency: number | null;
        octaveFrequency: number | null;
        compoundFifthFrequency: number | null;
        noteName: string;
      };
    }
  | { type: 'SKIP_NOTE' }
  | { type: 'RESET_TUNING_SESSION' };

const initialState: AppState = {
  selectedScale: null,
  tuningResults: [],
  contactInfo: { name: '', email: '', phone: '', message: '' },
  currentNoteIndex: 0,
  notesCount: null,
  detectedNote: null,
  phase: 'idle',
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | undefined>(undefined);

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_SCALE':
      return { ...state, selectedScale: action.payload, tuningResults: [], currentNoteIndex: 0 };
    case 'SET_NOTES_COUNT':
      return { ...state, notesCount: action.payload };
    case 'ADD_TUNING_RESULT': {
      const results = [...state.tuningResults];
      results[state.currentNoteIndex] = action.payload;
      return { ...state, tuningResults: results };
    }
    case 'SET_CONTACT_INFO':
      return { ...state, contactInfo: { ...state.contactInfo, ...action.payload } };
    case 'SET_CURRENT_NOTE_INDEX':
      return { ...state, currentNoteIndex: action.payload };
    case 'SET_DETECTED_NOTE':
      return { ...state, detectedNote: action.payload };
    case 'RESET_EVALUATION':
      return { ...initialState };
    // ── 2-step tuning workflow ────────────────────────────────────────────────
    case 'START_TUNING_SESSION':
      return {
        ...state,
        phase: 'identification',
        notesCount: action.payload.notesCount,
        currentNoteIndex: 0,
        detectedNote: null,
        tuningResults: [],
      };
    case 'MOVE_TO_IDENTIFICATION':
      return {
        ...state,
        phase: 'identification',
        currentNoteIndex: state.currentNoteIndex + 1,
        detectedNote: null, // Clear note when advancing to the next identification step
      };
    case 'MOVE_TO_STROBE_MEASUREMENT':
      return { ...state, phase: 'strobe-measurement' };
    case 'MOVE_TO_RESULTS':
      return { ...state, phase: 'results' };
    case 'CLEAR_DETECTED_NOTE':
      return { ...state, detectedNote: null };
    case 'RECORD_MEASUREMENT': {
      const {
        fundamentalCents,
        frequency,
        octaveFrequency,
        octaveCents,
        compoundFifthFrequency,
        compoundFifthCents,
        noteName,
      } = action.payload;
      const absCents = fundamentalCents !== null ? Math.abs(fundamentalCents) : Infinity;
      const status: TuningResult['status'] =
        absCents <= 5 ? 'in-tune' :
        absCents <= 17.5 ? 'slightly-out-of-tune' :
        'out-of-tune';
      const results = [...state.tuningResults];
      results[state.currentNoteIndex] = {
        noteName,
        targetFrequency: frequency ?? 0,
        detectedFrequency: frequency,
        cents: fundamentalCents,
        status,
        octaveFreq: octaveFrequency ?? undefined,
        octaveCents: octaveCents ?? undefined,
        compoundFifthFreq: compoundFifthFrequency ?? undefined,
        compoundFifthCents: compoundFifthCents ?? undefined,
      };
      return { ...state, tuningResults: results };
    }
    case 'SKIP_NOTE': {
      const results = [...state.tuningResults];
      const skipped = results[state.currentNoteIndex];
      if (skipped) {
        results[state.currentNoteIndex] = { ...skipped, status: 'skipped' };
      }
      return { ...state, tuningResults: results };
    }
    case 'RESET_TUNING_SESSION':
      return {
        ...state,
        phase: 'idle',
        currentNoteIndex: 0,
        detectedNote: null,
        tuningResults: [],
      };
    default:
      return state;
  }
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
