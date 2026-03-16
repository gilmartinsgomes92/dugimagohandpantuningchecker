/**
 * Spectral template matcher for handpan note identification.
 *
 * Instead of detecting a single pitch and validating it, this module scores
 * the entire FFT spectrum against known harmonic templates for every possible
 * handpan note (MIDI 50–84, D3–C6). The best-matching template is returned
 * when it scores above a minimum threshold.
 *
 * Algorithm:
 *  For each candidate MIDI note:
 *   1. Compute expected frequencies for partials 1f, 2f, 3f, 4f
 *   2. Find the FFT peak within a configurable cents window of each partial
 *   3. Compute partial score = prominence × frequency_accuracy
 *   4. Total score = weighted sum / total_weight
 *  Return the highest-scoring candidate above MIN_MATCH_SCORE.
 *
 * Weights: 1f → 1.0, 2f → 0.8, 3f → 0.6, 4f → 0.3
 *
 * This naturally handles:
 *  - Octave/compound-fifth being louder than fundamental (all partials contribute)
 *  - Sympathetic resonance (struck note's full template scores higher)
 *
 * Important behaviour:
 *  - First tries the normal strict window for best accuracy
 *  - If nothing matches, retries once with a wider fallback window so
 *    severely detuned notes still snap to the nearest semitone instead of
 *    disappearing completely
 */

import { midiToFrequency } from './musicUtils';

/** MIDI note range covering the standard handpan range D3–C6. */
const MIN_MIDI = 50; // D3
const MAX_MIDI = 84; // C6

/** Half-width of the normal search window around each expected partial (cents). */
const SEARCH_CENTS = 50;

/** Wider fallback window (cents) used only when the strict matcher finds nothing. */
const FALLBACK_SEARCH_CENTS = 90;

/** Noise floor below which a bin is considered silent (dB). */
const NOISE_FLOOR_DB = -85;

/**
 * dB range mapped onto [0, 1] for prominence normalisation.
 * A peak at (NOISE_FLOOR_DB + PROMINENCE_RANGE_DB) or louder gets prominence = 1.
 */
const PROMINENCE_RANGE_DB = 65; // −65 dB → 0,  −20 dB → 1

/** Minimum match score required to return a result. */
const MIN_MATCH_SCORE = 0.22;

/** Partial multipliers and their scoring weights [1f, 2f, 3f, 4f]. */
const PARTIAL_MULTIPLES = [1, 2, 3, 4] as const;
const PARTIAL_WEIGHTS = [1.0, 0.8, 0.6, 0.3] as const;
const TOTAL_WEIGHT = PARTIAL_WEIGHTS.reduce((a, b) => a + b, 0); // 2.7

/** Result returned by {@link matchNote}. */
export interface TemplateMatchResult {
  /** Best-matching MIDI note number (50–84). */
  midiNote: number;
  /** Equal-temperament frequency of the matched note (Hz). */
  nominalFreq: number;
  /** Match score in [MIN_MATCH_SCORE, 1]. */
  score: number;
}

/**
 * Finds the highest-magnitude FFT bin within ±searchCents of targetFreq.
 *
 * @returns Interpolated peak frequency in Hz, or null if no peak above noise floor.
 */
function findPeakInWindow(
  freqData: Float32Array,
  targetFreq: number,
  sampleRate: number,
  fftSize: number,
  searchCents: number = SEARCH_CENTS,
): number | null {
  const binHz = sampleRate / fftSize;
  const numBins = freqData.length; // fftSize / 2

  const ratio = Math.pow(2, searchCents / 1200);
  const lowBin = Math.max(1, Math.floor((targetFreq / ratio) / binHz));
  const highBin = Math.min(numBins - 2, Math.ceil((targetFreq * ratio) / binHz));

  if (lowBin >= highBin) return null;

  let peakBin = lowBin;
  let peakMag = freqData[lowBin];
  for (let k = lowBin + 1; k <= highBin; k++) {
    if (freqData[k] > peakMag) {
      peakMag = freqData[k];
      peakBin = k;
    }
  }

  if (peakMag < NOISE_FLOOR_DB) return null;

  // Parabolic interpolation for sub-bin accuracy
  const prevMag = freqData[peakBin - 1];
  const nextMag = freqData[peakBin + 1];
  const denom = 2.0 * peakMag - prevMag - nextMag;
  let delta = 0;
  if (Math.abs(denom) > 1e-6) {
    delta = 0.5 * (nextMag - prevMag) / denom;
    delta = Math.max(-0.5, Math.min(0.5, delta));
  }

  return (peakBin + delta) * binHz;
}

/**
 * Scores the FFT spectrum against harmonic templates for all handpan notes
 * (MIDI 50–84) and returns the best-matching template for the provided
 * search window.
 */
function matchNoteWithSearchWindow(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  searchCents: number,
): TemplateMatchResult | null {
  const binHz = sampleRate / fftSize;
  const nyquist = sampleRate / 2;

  let bestScore = MIN_MATCH_SCORE;
  let bestMidi = -1;
  let bestFreq = 0;

  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
    const nominalFreq = midiToFrequency(midi);
    let weightedSum = 0;

    for (let pi = 0; pi < PARTIAL_MULTIPLES.length; pi++) {
      const mult = PARTIAL_MULTIPLES[pi];
      const weight = PARTIAL_WEIGHTS[pi];
      const targetFreq = nominalFreq * mult;

      // Skip partials above the usable FFT range
      if (targetFreq > nyquist) continue;

      const peakFreq = findPeakInWindow(freqData, targetFreq, sampleRate, fftSize, searchCents);
      if (peakFreq === null) continue;

      // Prominence: how far the peak is above the noise floor, normalised to [0, 1]
      const peakBin = Math.max(0, Math.min(freqData.length - 1, Math.round(peakFreq / binHz)));
      const peakDb = freqData[peakBin];
      const prominence = Math.min(1, Math.max(0, (peakDb - NOISE_FLOOR_DB) / PROMINENCE_RANGE_DB));

      // Frequency accuracy: 1.0 at exact match, 0 at ±searchCents
      const centError = Math.abs(1200 * Math.log2(peakFreq / targetFreq));
      const accuracy = Math.max(0, 1 - centError / searchCents);

      weightedSum += weight * prominence * accuracy;
    }

    const score = weightedSum / TOTAL_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      bestMidi = midi;
      bestFreq = nominalFreq;
    }
  }

  if (bestMidi < 0) return null;
  return { midiNote: bestMidi, nominalFreq: bestFreq, score: bestScore };
}

/**
 * Matches the current spectrum to the nearest handpan note template.
 *
 * Strict path first for normal accuracy.
 * Fallback-wide path second for severely detuned notes.
 */
export function matchNote(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
): TemplateMatchResult | null {
  const strict = matchNoteWithSearchWindow(freqData, sampleRate, fftSize, SEARCH_CENTS);
  if (strict !== null) return strict;

  return matchNoteWithSearchWindow(freqData, sampleRate, fftSize, FALLBACK_SEARCH_CENTS);
}
