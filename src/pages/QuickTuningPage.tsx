import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor, frequencyToNote } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;

// Number of frames to skip (attack phase) before collecting frequencies for the trimmed mean.
// The initial transient of a handpan note (attack phase) has the brightest harmonics
// and the most noise in the fundamental estimate. Skipping the first ~15 frames
// (~250 ms at 60 fps) avoids this region and collects only from the cleaner sustain
// phase — mirroring the behaviour of professional strobe tuners like Linotune, which
// begin reading approximately 1 second after the note is struck.
const ATTACK_SKIP_FRAMES = 15;

// Minimum number of sustain-phase frequency samples required before registration.
// Even if confidence exceeds the threshold earlier, we wait for enough measurements
// to produce a reliable trimmed mean.
const MIN_FREQ_SAMPLES = 10;

// EMA confidence parameters
const RISE_RATE = 0.08;   // confidence += RISE_RATE * matchScore per matching frame
const DECAY_RATE = 0.02;  // confidence -= DECAY_RATE per frame for non-matching notes
const CONFIDENCE_THRESHOLD = 0.75; // confidence level required to register a note

/**
 * Per-pitch-class EMA confidence tracker.
 *
 * Tracks a confidence value for each detected pitch class. On each frame:
 *  - The detected pitch class rises by RISE_RATE × matchScore (template quality)
 *  - All other tracked pitch classes decay by DECAY_RATE
 *
 * This replaces the binary stability counter + GLITCH_TOLERANCE system so that
 * short bursts of sympathetic resonance cause only a small confidence dip rather
 * than a catastrophic reset to 0.
 */
class NoteConfidenceTracker {
  private confidences: Map<string, number> = new Map();

  update(pitchClass: string, matchScore: number): void {
    // When matchScore is 0 there is no confidence boost for the detected pitch class,
    // but the decay for all other classes still runs. This is intentional: a matchScore
    // of 0 means the template matcher found no good evidence for the note, so we should
    // not increase confidence — only let competing candidates decay slightly.
    const current = this.confidences.get(pitchClass) ?? 0;
    this.confidences.set(pitchClass, Math.min(1, current + RISE_RATE * matchScore));

    for (const [pc, conf] of this.confidences) {
      if (pc !== pitchClass) {
        this.confidences.set(pc, Math.max(0, conf - DECAY_RATE));
      }
    }
  }

  getConfidence(pitchClass: string): number {
    return this.confidences.get(pitchClass) ?? 0;
  }

  getLeadingEntry(): { pitchClass: string; confidence: number } | null {
    let best: { pitchClass: string; confidence: number } | null = null;
    for (const [pc, conf] of this.confidences) {
      if (conf > 0 && (best === null || conf > best.confidence)) {
        best = { pitchClass: pc, confidence: conf };
      }
    }
    return best;
  }

  reset(): void {
    this.confidences.clear();
  }
}

function getTuningStatus(absCents: number): TuningResult['status'] {
  if (absCents <= 7) return 'in-tune';
  if (absCents <= 15) return 'slightly-out-of-tune';
  return 'out-of-tune';
}

function getTuningLabel(status: TuningResult['status']): string {
  if (status === 'in-tune') return '✅ In Tune';
  if (status === 'slightly-out-of-tune') return '⚠️ Slightly Out of Tune';
  return '❌ Out of Tune';
}

function getTuningClassName(status: TuningResult['status']): string {
  if (status === 'in-tune') return 'status-in-tune';
  if (status === 'slightly-out-of-tune') return 'status-slightly-out';
  return 'status-out-of-tune';
}

const QuickTuningPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { isListening, result, error, startListening, stopListening } = useAudioProcessor();

  const notesCount = state.notesCount ?? 0;
  const noteIndex = state.currentNoteIndex;

  const stableFrequencies = useRef<number[]>([]);
  // Independently collected octave and compound-fifth partial frequencies for each
  // sustain-phase frame. Measuring partials directly from the FFT rather than deriving
  // them as exact multiples of the fundamental accounts for the inharmonicity present
  // in real handpan metal — giving each partial its own accurate measurement.
  const stableOctaveFreqs = useRef<number[]>([]);
  const stableCFifthFreqs = useRef<number[]>([]);
  const justRegistered = useRef(false);
  // Tracks full note names (e.g. "A3", "D3") already registered this session to prevent
  // duplicates. Using full name rather than pitch class avoids blocking D2 and D3 (both
  // class "D") from registering as distinct notes.
  const registeredNoteNames = useRef<Set<string>>(new Set());
  // EMA confidence tracker — replaces binary stableFrames + GLITCH_TOLERANCE counter
  const trackerRef = useRef<NoteConfidenceTracker>(new NoteConfidenceTracker());
  // Pitch class of the current leading candidate (highest confidence)
  const leadingPitchClassRef = useRef<string | null>(null);
  // Number of frames the current leading pitch class has been leading (for attack skip)
  const leadingFrameCountRef = useRef(0);

  const resetStabilityState = useCallback(() => {
    trackerRef.current.reset();
    leadingPitchClassRef.current = null;
    leadingFrameCountRef.current = 0;
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
  }, []);
  const registeredCount = state.tuningResults.filter(
    r => r.status !== 'pending'
  ).length;

  useEffect(() => {
    if (!state.notesCount) navigate('/notes-count-selection');
  }, [state.notesCount, navigate]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  // Auto-start listening when the page loads
  useEffect(() => {
    if (!isListening) startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to results when all notes are registered
  useEffect(() => {
    if (notesCount > 0 && registeredCount >= notesCount) {
      stopListening();
      navigate('/results');
    }
  }, [registeredCount, notesCount, stopListening, navigate]);

  const registerNote = useCallback(() => {
    if (justRegistered.current) return;

    // Compute the trimmed mean of a sorted frequency list: discard the outer 25% on
    // each side (removing outliers) and average the central 50%. Falls back to the
    // single middle element when trimming would leave an empty array.
    const trimmedMean = (freqs: number[]): number | null => {
      if (freqs.length === 0) return null;
      const sorted = [...freqs].sort((a, b) => a - b);
      const trimCount = Math.floor(sorted.length * 0.25);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      return trimmed.length > 0
        ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
        : sorted[Math.floor((sorted.length - 1) / 2)];
    };

    // Derive the fundamental from the trimmed mean of collected sustain-phase frames.
    const detectedFreq = trimmedMean(stableFrequencies.current) ?? result.frequency;
    if (detectedFreq === null) return;

    const noteData = frequencyToNote(detectedFreq);
    const cents = noteData.cents;
    const noteName = noteData.fullName;

    // Prevent the same note from being registered more than once per session.
    // A second strike of the same note after cooldown would otherwise register it again
    // at the next noteIndex slot. Compare by full note name (e.g. "A3") so that different
    // octaves of the same letter (e.g. "D2" vs "D3") are treated as distinct notes.
    //
    // IMPORTANT: the duplicate check is intentionally done BEFORE setting justRegistered.
    // If we entered a 1500 ms cooldown here, the still-ringing ding note (which can ring
    // for 5-10 s on a handpan) would re-trigger the duplicate guard on every 45-frame
    // window, creating a cascade of back-to-back cooldowns that blocks all other notes.
    // By simply resetting stability and returning (no cooldown), we let detection continue
    // immediately so the next different note can accumulate without delay.
    if (registeredNoteNames.current.has(noteName)) {
      resetStabilityState();
      return;
    }

    // Mark as in-progress only after confirming this is a new, unregistered note, so the
    // ring-out duplicate path above never locks out detection of subsequent notes.
    justRegistered.current = true;
    registeredNoteNames.current.add(noteName);

    const midiFloat = 12 * Math.log2(detectedFreq / 440) + 69;
    const midiNote = Math.round(midiFloat);

    // Independently measure the octave and compound-fifth partials from the FFT data
    // collected during the sustain window. Real handpan partials deviate from exact 2:1
    // and 3:1 ratios due to the physical geometry of the metal (inharmonicity), so
    // computing them as detectedFreq × 2 / × 3 would inherit the fundamental's bias and
    // assume perfect harmonicity. Using independently measured trimmed means gives each
    // partial its own accurate reading — matching how professional strobe tuners like
    // Linotune measure the fundamental, octave, and compound fifth independently.
    //
    // Guard: only use the independent measurement if it is within ±40 cents of the
    // exact-multiple estimate. Beyond this the FFT peak-finder has landed on a stray
    // peak (e.g. sympathetic resonance, room noise, or a neighbouring harmonic) rather
    // than the true physical partial. Genuine handpan inharmonicity is typically < 30¢,
    // so a ±40¢ window accepts real deviations while rejecting false measurements.
    const MAX_PARTIAL_CENTS = 40;
    const rawOctave = trimmedMean(stableOctaveFreqs.current);
    const octaveFreq = rawOctave !== null &&
      Math.abs(1200 * Math.log2(rawOctave / (detectedFreq * 2))) <= MAX_PARTIAL_CENTS
        ? rawOctave
        : detectedFreq * 2;
    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const octaveCents = 1200 * Math.log2(octaveFreq / targetOctaveFreq);

    // 19 semitones = 12 (octave) + 7 (perfect fifth) — ET target for the compound fifth
    const rawCFifth = trimmedMean(stableCFifthFreqs.current);
    const compoundFifthFreq = rawCFifth !== null &&
      Math.abs(1200 * Math.log2(rawCFifth / (detectedFreq * 3))) <= MAX_PARTIAL_CENTS
        ? rawCFifth
        : detectedFreq * 3;
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);
    const compoundFifthCents = 1200 * Math.log2(compoundFifthFreq / targetCompoundFifthFreq);

    const absCents = Math.abs(cents);
    const status = getTuningStatus(absCents);

    const payload: TuningResult = {
      noteName,
      targetFrequency: midiToFrequency(midiNote),
      detectedFrequency: detectedFreq,
      cents,
      status,
      compoundFifthFreq,
      compoundFifthCents,
      octaveFreq,
      octaveCents,
    };

    dispatch({ type: 'ADD_TUNING_RESULT', payload });
    dispatch({ type: 'SET_CURRENT_NOTE_INDEX', payload: noteIndex + 1 });

    // Reset stability tracking for the next note
    resetStabilityState();

    // Allow registering again after a short pause, and reset stability state
    // so the next strike starts with a clean detection window rather than
    // inheriting frames accumulated while the previous note was still ringing.
    setTimeout(() => {
      resetStabilityState();
      justRegistered.current = false;
    }, REGISTRATION_COOLDOWN_MS);
  }, [result, noteIndex, dispatch, resetStabilityState]);

  // EMA Confidence stability: auto-register when the leading pitch class confidence
  // reaches CONFIDENCE_THRESHOLD and at least MIN_FREQ_SAMPLES have been collected.
  // Using per-pitch-class EMA means short bursts of sympathetic resonance only cause
  // a small confidence dip (DECAY_RATE per frame) rather than resetting to 0.

  useEffect(() => {
    // Reset stability when not listening or during post-registration cooldown.
    // Only skip (not reset) when the result is null — silence grace in useAudioProcessor
    // handles the clearing, so resetting here would destroy accumulated progress on decay dips.
    if (!isListening || justRegistered.current) {
      resetStabilityState();
      return;
    }
    if (result.frequency === null || result.noteName === null) {
      return;
    }

    // Transparently skip frames where the detected note is already registered.
    // This prevents ring-out of a previously-registered note (which can last 5–10 s on a
    // handpan) from either (a) accumulating false stability that re-triggers the duplicate
    // guard on every window, or (b) resetting the stability counter for the note the user
    // is actually playing next. Skipped frames leave the tracker unchanged so that
    // isolated ring-out blips interleaved with the new note do not break accumulation.
    if (registeredNoteNames.current.has(result.noteName)) {
      return;
    }

    // Strip the trailing octave digit(s) to get the pitch class, e.g. "A3" → "A", "D#4" → "D#"
    const pitchClass = result.noteName.replace(/\d+$/, '');
    const matchScore = result.matchScore;

    // Update per-pitch-class EMA confidence
    trackerRef.current.update(pitchClass, matchScore);

    const leading = trackerRef.current.getLeadingEntry();
    if (leading === null) return;

    // Detect leader change — reset frame counter and frequency collection for the new leader
    if (leading.pitchClass !== leadingPitchClassRef.current) {
      leadingPitchClassRef.current = leading.pitchClass;
      leadingFrameCountRef.current = 0;
      stableFrequencies.current = [];
      stableOctaveFreqs.current = [];
      stableCFifthFreqs.current = [];
    }

    // Only count and collect when the current frame's pitch matches the leading candidate
    if (pitchClass === leading.pitchClass) {
      leadingFrameCountRef.current += 1;
      // Skip attack-phase frames: only collect frequencies from the sustain phase.
      // The first ATTACK_SKIP_FRAMES of each stable window cover the initial transient
      // where harmonics are brightest and pitch estimates are noisiest. Collecting only
      // from frames after ATTACK_SKIP_FRAMES gives a cleaner trimmed-mean measurement.
      if (leadingFrameCountRef.current > ATTACK_SKIP_FRAMES) {
        stableFrequencies.current.push(result.frequency);
        // Also collect independently-measured octave and compound-fifth frequencies
        // from the current frame. null values (partial not detectable) are skipped.
        if (result.octaveFrequency !== null) {
          stableOctaveFreqs.current.push(result.octaveFrequency);
        }
        if (result.compoundFifthFrequency !== null) {
          stableCFifthFreqs.current.push(result.compoundFifthFrequency);
        }
      }
    }

    // Register when confidence threshold is reached and enough samples collected
    if (
      leading.confidence >= CONFIDENCE_THRESHOLD &&
      stableFrequencies.current.length >= MIN_FREQ_SAMPLES &&
      !justRegistered.current
    ) {
      registerNote();
    }
  }, [result, isListening, registerNote, resetStabilityState]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;
  // Stability ring shows the leading note's EMA confidence (0–100%)
  const leadingEntry = trackerRef.current.getLeadingEntry();
  const stabilityPct = leadingEntry ? Math.round(leadingEntry.confidence * 100) : 0;

  return (
    <div className="page quick-tuning-page">
      <div className="page-header">
        <div className="tuning-progress-bar">
          <div className="tuning-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="progress-label">
          {registeredCount} of {notesCount} notes registered
        </p>
      </div>

      <div className="note-prompt-card">
        <div className="note-zone-label">Play any note on your handpan</div>
        <div className="note-prompt-name" style={{ color: statusColor }}>
          {result.noteName ?? '—'}
        </div>
        {result.frequency !== null && (
          <div className="note-prompt-freq">{result.frequency.toFixed(2)} Hz</div>
        )}
        <p className="note-instruction">Hold the note ringing — it will be auto-registered</p>
      </div>

      <div className="tuning-display">
        <div className="quick-stability-ring">
          <svg viewBox="0 0 100 100" className="stability-svg">
            <circle cx="50" cy="50" r="44" className="stability-track" />
            <circle
              cx="50" cy="50" r="44"
              className="stability-fill"
              style={{
                strokeDasharray: `${stabilityPct * 2.764} ${276.4}`,
                stroke: statusColor,
              }}
            />
          </svg>
          <div className="stability-center">
            {stabilityPct > 0 ? (
              <span className="stability-pct" style={{ color: statusColor }}>{stabilityPct}%</span>
            ) : (
              <span className="stability-idle">🎵</span>
            )}
          </div>
        </div>

        <div className="tuning-readings">
          {result.frequency !== null ? (
            <>
              <div className="reading-row">
                <span className="reading-label">Detected:</span>
                <span className="reading-value">{result.frequency.toFixed(2)} Hz</span>
              </div>
              <div className="reading-row">
                <span className="reading-label">Deviation:</span>
                <span className="reading-value" style={{ color: statusColor }}>
                  {result.cents !== null ? formatCents(result.cents) : '—'}
                </span>
              </div>
              {currentStatus && (
                <div className={`tuning-status-badge ${getTuningClassName(currentStatus)}`}>
                  {getTuningLabel(currentStatus)}
                </div>
              )}
            </>
          ) : (
            <div className="listening-placeholder">
              {isListening ? (
                <span className="listening-anim">🎵 Listening…</span>
              ) : (
                <span>Starting microphone…</span>
              )}
            </div>
          )}
        </div>
      </div>

      <CentsGauge cents={result.cents} label="Cents deviation" />

      {error && <div className="error-banner">{error}</div>}

      {registeredCount > 0 && (
        <div className="registered-notes-list">
          <h4 className="registered-notes-title">Registered Notes</h4>
          {state.tuningResults.slice(0, registeredCount).map((r, i) => {
            const color = r.cents !== null ? centsToColor(r.cents) : '#555';
            return (
              <div key={i} className="registered-note-row">
                <span className="reg-note-name">{r.noteName}</span>
                <span className="reg-note-cents" style={{ color }}>
                  {r.cents !== null ? formatCents(r.cents) : '—'}
                </span>
                <span className={`reg-note-status ${getTuningClassName(r.status as TuningResult['status'])}`}>
                  {r.status === 'in-tune' ? '✅' : r.status === 'slightly-out-of-tune' ? '⚠️' : '❌'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-actions">
        <button
          className="btn btn-secondary"
          onClick={() => {
            stopListening();
            navigate('/notes-count-selection');
          }}
        >
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            stopListening();
            navigate('/results');
          }}
          disabled={registeredCount === 0}
        >
          View Results →
        </button>
      </div>
    </div>
  );
};

export default QuickTuningPage;
