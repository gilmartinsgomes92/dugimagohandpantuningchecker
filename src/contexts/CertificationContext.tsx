/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { CertificationStrike, ExpectedPartials } from '../types/certification';
import { aggregateCertificationNote } from '../utils/certificationAggregation';

interface CertificationState {
  notesCount: number | null;
  verificationId: string | null;
  currentNoteIndex: number;
  strikesByNote: CertificationStrike[][];
  expectationsByNote: Record<number, ExpectedPartials>;
  lockedNoteNames: Record<number, string | null>;
}

type CertificationAction =
  | { type: 'START_CERTIFICATION_SESSION'; payload: { notesCount: number; verificationId: string } }
  | { type: 'RECORD_STRIKE'; payload: { noteIndex: number; strike: CertificationStrike } }
  | { type: 'REMOVE_LAST_STRIKE'; payload: { noteIndex: number } }
  | { type: 'ADVANCE_TO_NEXT_NOTE' }
  | { type: 'SET_NOTE_EXPECTATIONS'; payload: { noteIndex: number; expectations: Partial<ExpectedPartials> } }
  | { type: 'SET_LOCKED_NOTE_NAME'; payload: { noteIndex: number; noteName: string | null } }
  | { type: 'RESET_CURRENT_NOTE'; payload: { noteIndex: number } }
  | { type: 'RESET_CERTIFICATION_SESSION' };

const defaultExpectedPartials: ExpectedPartials = {
  octave: true,
  compoundFifth: true,
};

const initialState: CertificationState = {
  notesCount: null,
  verificationId: null,
  currentNoteIndex: 0,
  strikesByNote: [],
  expectationsByNote: {},
  lockedNoteNames: {},
};

const CertificationContext = createContext<{
  state: CertificationState;
  dispatch: React.Dispatch<CertificationAction>;
} | null>(null);

function certificationReducer(state: CertificationState, action: CertificationAction): CertificationState {
  switch (action.type) {
    case 'START_CERTIFICATION_SESSION': {
      const strikesByNote = Array.from({ length: action.payload.notesCount }, () => [] as CertificationStrike[]);
      const expectationsByNote: Record<number, ExpectedPartials> = {};
      const lockedNoteNames: Record<number, string | null> = {};

      for (let i = 0; i < action.payload.notesCount; i += 1) {
        expectationsByNote[i] = { ...defaultExpectedPartials };
        lockedNoteNames[i] = null;
      }

      return {
        notesCount: action.payload.notesCount,
        verificationId: action.payload.verificationId,
        currentNoteIndex: 0,
        strikesByNote,
        expectationsByNote,
        lockedNoteNames,
      };
    }
    case 'RECORD_STRIKE': {
      const next = state.strikesByNote.map((strikes) => [...strikes]);
      next[action.payload.noteIndex].push(action.payload.strike);
      return { ...state, strikesByNote: next };
    }
    case 'REMOVE_LAST_STRIKE': {
      const next = state.strikesByNote.map((strikes) => [...strikes]);
      next[action.payload.noteIndex].pop();
      return { ...state, strikesByNote: next };
    }
    case 'ADVANCE_TO_NEXT_NOTE':
      return {
        ...state,
        currentNoteIndex: Math.min((state.notesCount ?? 1) - 1, state.currentNoteIndex + 1),
      };
    case 'SET_NOTE_EXPECTATIONS':
      return {
        ...state,
        expectationsByNote: {
          ...state.expectationsByNote,
          [action.payload.noteIndex]: {
            ...(state.expectationsByNote[action.payload.noteIndex] ?? defaultExpectedPartials),
            ...action.payload.expectations,
          },
        },
      };
    case 'SET_LOCKED_NOTE_NAME':
      return {
        ...state,
        lockedNoteNames: {
          ...state.lockedNoteNames,
          [action.payload.noteIndex]: action.payload.noteName,
        },
      };
    case 'RESET_CURRENT_NOTE': {
      const next = state.strikesByNote.map((strikes) => [...strikes]);
      next[action.payload.noteIndex] = [];
      return {
        ...state,
        strikesByNote: next,
        lockedNoteNames: {
          ...state.lockedNoteNames,
          [action.payload.noteIndex]: null,
        },
      };
    }
    case 'RESET_CERTIFICATION_SESSION':
      return initialState;
    default:
      return state;
  }
}

export const CertificationProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(certificationReducer, initialState);
  return <CertificationContext.Provider value={{ state, dispatch }}>{children}</CertificationContext.Provider>;
};

export function useCertificationContext() {
  const ctx = useContext(CertificationContext);
  if (!ctx) throw new Error('useCertificationContext must be used within a CertificationProvider');
  return ctx;
}

export function useCertificationAggregates() {
  const { state } = useCertificationContext();

  return useMemo(() => {
    return state.strikesByNote.map((strikes, noteIndex) =>
      aggregateCertificationNote(strikes, state.expectationsByNote[noteIndex] ?? defaultExpectedPartials),
    );
  }, [state.strikesByNote, state.expectationsByNote]);
}
