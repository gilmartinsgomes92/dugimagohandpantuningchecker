/**
 * TuningCalculator service – deviation calculations relative to equal temperament.
 *
 * Converts raw detected frequencies into musically meaningful cent deviations
 * from the nearest equal-temperament note, using A4 = 440 Hz as the reference.
 */

import { frequencyToNote, centsDeviation, midiToFrequency } from '../../utils/musicUtils';

export interface NoteDeviation {
  /** Full note name, e.g. "D3" */
  noteName: string;
  /** Closest equal-temperament frequency in Hz */
  referenceFrequency: number;
  /** Signed deviation in cents (positive = sharp, negative = flat) */
  cents: number;
  /** MIDI note number */
  midiNote: number;
}

export class TuningCalculator {
  /**
   * Calculate the deviation of a detected frequency from its nearest
   * equal-temperament note.
   *
   * @param detectedFreq - Measured frequency in Hz
   * @returns NoteDeviation with note name, reference frequency and cents deviation
   */
  calculate(detectedFreq: number): NoteDeviation {
    const noteInfo = frequencyToNote(detectedFreq);
    const referenceFrequency = midiToFrequency(noteInfo.midiNote);
    const cents = centsDeviation(detectedFreq, referenceFrequency);
    return {
      noteName: noteInfo.fullName,
      referenceFrequency,
      cents,
      midiNote: noteInfo.midiNote,
    };
  }

  /**
   * Calculate the deviation between two raw frequencies.
   *
   * @param detectedFreq - Measured frequency in Hz
   * @param referenceFreq - Target frequency in Hz
   * @returns Signed cents deviation (positive = sharp, negative = flat)
   */
  deviationCents(detectedFreq: number, referenceFreq: number): number {
    return centsDeviation(detectedFreq, referenceFreq);
  }
}
