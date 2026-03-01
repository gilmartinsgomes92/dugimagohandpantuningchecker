/**
 * HarmonicAnalyzer service – extracts fundamental, octave, and fifth partials.
 *
 * Combines PitchDetector and FFTAnalyzer to independently measure the
 * three acoustically tuned partials of a handpan tonefield:
 *   - Fundamental (1×)
 *   - Octave (2× fundamental)
 *   - Compound fifth / "fifth" (3× fundamental)
 *
 * Each partial is independently detected in the FFT spectrum rather than
 * derived by arithmetic from the fundamental, so inharmonicity in real
 * instruments is correctly captured.
 */

import { PitchDetector } from './pitchDetector';
import { FFTAnalyzer } from './fftAnalyzer';
import { calcCents } from '../../utils/harmonicAnalyzer';
import type { FrequencyReading } from '../../types/tuning';

const NO_READING: FrequencyReading = { frequency: 0, deviation: 0, confidence: 0 };

export interface HarmonicReadings {
  fundamental: FrequencyReading;
  octave: FrequencyReading;
  fifth: FrequencyReading;
}

export class HarmonicAnalyzer {
  private readonly pitchDetector: PitchDetector;
  private readonly fftAnalyzer: FFTAnalyzer;

  constructor(sampleRate: number, fftSize: number) {
    this.pitchDetector = new PitchDetector(sampleRate, fftSize);
    this.fftAnalyzer = new FFTAnalyzer(sampleRate, fftSize);
  }

  /**
   * Analyse one frame of audio and return frequency readings for the
   * fundamental, octave, and fifth partials.
   *
   * @param timeDomain - Float32Array from AnalyserNode.getFloatTimeDomainData()
   * @param freqDomain - Float32Array from AnalyserNode.getFloatFrequencyData()
   * @returns HarmonicReadings or null if no pitch was detected
   */
  analyse(timeDomain: Float32Array, freqDomain: Float32Array): HarmonicReadings | null {
    const pitchResult = this.pitchDetector.detect(timeDomain, freqDomain);
    if (pitchResult.frequency === null) return null;

    const fundamentalFreq = pitchResult.frequency;
    const confidence = pitchResult.confidence;

    // Measure octave (2×) and fifth (3×) independently from the FFT spectrum
    const octavePeak = this.fftAnalyzer.findPeak(freqDomain, fundamentalFreq * 2);
    const fifthPeak = this.fftAnalyzer.findPeak(freqDomain, fundamentalFreq * 3);

    const octaveFreq = octavePeak.frequency ?? fundamentalFreq * 2;
    const fifthFreq = fifthPeak.frequency ?? fundamentalFreq * 3;

    // Cent deviations from ideal integer ratios
    const octaveDev = calcCents(octaveFreq, fundamentalFreq * 2) ?? 0;
    const fifthDev = calcCents(fifthFreq, fundamentalFreq * 3) ?? 0;

    return {
      fundamental: {
        frequency: fundamentalFreq,
        deviation: 0, // deviation from itself is 0; use TuningCalculator for note deviation
        confidence,
      },
      octave: {
        frequency: octaveFreq,
        deviation: octaveDev,
        confidence: octavePeak.frequency !== null ? confidence * 0.9 : confidence * 0.5,
      },
      fifth: {
        frequency: fifthFreq,
        deviation: fifthDev,
        confidence: fifthPeak.frequency !== null ? confidence * 0.85 : confidence * 0.5,
      },
    };
  }

  /** Returns a zeroed-out HarmonicReadings placeholder (no signal detected). */
  static emptyReadings(): HarmonicReadings {
    return { fundamental: { ...NO_READING }, octave: { ...NO_READING }, fifth: { ...NO_READING } };
  }
}
