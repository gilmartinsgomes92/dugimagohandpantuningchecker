/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';

export interface TuningResult {
  noteName: string;
  targetFrequency: number;
  detectedFrequency: number | null;
  cents: number | null;
  status: 'in-tune' | 'flat' | 'sharp' | 'skipped' | 'pending';
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  message: string;
}

interface AppState {
  selectedScale: string | null;
  tuningResults: TuningResult[];
  contactInfo: ContactInfo;
  currentNoteIndex: number;
}

type AppAction =
  | { type: 'SET_SCALE'; payload: string }
  | { type: 'ADD_TUNING_RESULT'; payload: TuningResult }
  | { type: 'SET_CONTACT_INFO'; payload: Partial<ContactInfo> }
  | { type: 'SET_CURRENT_NOTE_INDEX'; payload: number }
  | { type: 'RESET_EVALUATION' };

const initialState: AppState = {
  selectedScale: null,
  tuningResults: [],
  contactInfo: { name: '', email: '', phone: '', message: '' },
  currentNoteIndex: 0,
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | undefined>(undefined);

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_SCALE':
      return { ...state, selectedScale: action.payload, tuningResults: [], currentNoteIndex: 0 };
    case 'ADD_TUNING_RESULT': {
      const results = [...state.tuningResults];
      results[state.currentNoteIndex] = action.payload;
      return { ...state, tuningResults: results };
    }
    case 'SET_CONTACT_INFO':
      return { ...state, contactInfo: { ...state.contactInfo, ...action.payload } };
    case 'SET_CURRENT_NOTE_INDEX':
      return { ...state, currentNoteIndex: action.payload };
    case 'RESET_EVALUATION':
      return { ...initialState };
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
