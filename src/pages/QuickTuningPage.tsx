import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor, frequencyToNote } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Auto-register a note after this many consecutive stable frames.
// At ~60fps this is approximately 1.5 seconds; actual time depends on
// the requestAnimationFrame rate used by the useAudioProcessor hook.
const STABLE_FRAMES_REQUIRED = 90;

// Number of consecutive frames of a *different* pitch class required before
// the stability counter is reset. Brief stray detections (sympathetic resonance,
// room noise, octave slip) typically last only 1–3 frames; a genuine new note
// produces a sustained run. Setting this to ~8 frames (~130 ms at 60 fps) means
// a short transient between strikes does NOT wipe the accumulated progress.
const COMPETING_RESET_THRESHOLD = 8;

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;

// Number of stable frames to skip before collecting frequencies for the median.
// The initial transient of a handpan note (attack phase) has the brightest harmonics
// and the most noise in the fundamental estimate. Skipping the first ~60 frames
// (~1 s at 60 fps) avoids this region and collects only from the cleaner sustain
// phase — mirroring the behaviour of professional strobe tuners like Linotune, which
// begin reading approximately 1 second after the note is struck.
const ATTACK_SKIP_FRAMES = 60;

// dBFS thresholds for ambient-noise warnings (measured when no note is playing).
// 20 × log₁₀(rms) where rms=0.005 (noise gate) ≈ −46 dBFS.
// Values typical for phone/laptop mics in quiet vs. noisy rooms.
const NOISE_OK_DB = -50;      // below this → 🟢 quiet (ideal)
const NOISE_WARN_DB = -35;    // -50 to -35 → 🟡 some noise; above -35 → 🔴 noisy

function getNoiseBadge(db: number, notePlaying: boolean): { label: string; cls: string } | null {
  if (notePlaying) return null;
  if (db < NOISE_OK_DB) return { label: `🟢 ${db.toFixed(0)} dBFS — quiet`, cls: 'noise-ok' };
  if (db < NOISE_WARN_DB) return { label: `🟡 ${db.toFixed(0)} dBFS — some noise`, cls: 'noise-warn' };
  return { label: `🔴 ${db.toFixed(0)} dBFS — noisy, may affect accuracy`, cls: 'noise-loud' };
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

  const stableFrames = useRef(0);
  // Counts consecutive frames of a pitch class that differs from the current anchor.
  // Only resets the stability counter once this reaches COMPETING_RESET_THRESHOLD.
  const competingFrames = useRef(0);
  const lastPitchClass = useRef<string | null>(null);
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

  const resetStabilityState = useCallback(() => {
    stableFrames.current = 0;
    competingFrames.current = 0;
    lastPitchClass.current = null;
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

    // Derive the fundamental from the most common MIDI note (mode octave) among
    // collected sustain-phase frames. The YIN algorithm can lock onto the second
    // harmonic of a note (e.g. F5 instead of F4) if the first post-attack frame
    // happens to land there. By picking the mode MIDI note we choose whichever
    // octave had the most detections, then average only those frequencies —
    // correctly identifying F4 even when some frames detected F5.
    const midiNumbers = stableFrequencies.current.map(f => Math.round(12 * Math.log2(f / 440) + 69));
    const octaveCounts = new Map<number, number>();
    for (const m of midiNumbers) octaveCounts.set(m, (octaveCounts.get(m) ?? 0) + 1);
    const modeMidi = octaveCounts.size > 0
      ? [...octaveCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
    const modeFreqs = modeMidi !== null
      ? stableFrequencies.current.filter((_, i) => midiNumbers[i] === modeMidi)
      : stableFrequencies.current;
    const detectedFreq = trimmedMean(modeFreqs) ?? result.frequency;
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

  // Stability detection: auto-register when the same pitch class (note letter, ignoring
  // octave) is detected for STABLE_FRAMES_REQUIRED consecutive frames. Using pitch class
  // rather than exact note name or frequency makes the counter robust against the octave
  // jumps that the YIN algorithm produces on handpan harmonics (e.g. A3 ↔ A2).
  useEffect(() => {
    // Hard reset only when microphone is stopped or in the post-registration cooldown.
    if (!isListening || justRegistered.current) {
      resetStabilityState();
      return;
    }

    // No pitch detected this frame (low RMS or failed YIN) — skip without touching the
    // counter. A brief quiet patch during a note's natural decay must NOT erase accumulated
    // stability; resetting here would prevent the meter from ever reaching 100% because
    // handpan notes regularly dip below the RMS gate during their sustain phase.
    if (result.frequency === null || result.noteName === null) {
      return;
    }

    // Transparently skip frames where the detected note is already registered.
    // This prevents ring-out of a previously-registered note (which can last 5–10 s on a
    // handpan) from either (a) accumulating false stability that re-triggers the duplicate
    // guard on every 45-frame window, or (b) resetting the stability counter for the note
    // the user is actually playing next. Skipped frames leave the counter unchanged so that
    // isolated ring-out blips interleaved with the new note do not break accumulation.
    if (registeredNoteNames.current.has(result.noteName)) {
      return;
    }

    // Strip the trailing octave digit(s) to get the pitch class, e.g. "A3" → "A", "D#4" → "D#"
    const pitchClass = result.noteName.replace(/\d+$/, '');
    const anchor = lastPitchClass.current;

    if (anchor !== null && pitchClass === anchor) {
      // This frame matches the current anchor — reset the competing-pitch counter.
      competingFrames.current = 0;
      stableFrames.current += 1;
      // Skip attack-phase frames: only collect frequencies from the sustain phase.
      // The first ATTACK_SKIP_FRAMES of each stable window cover the initial transient
      // where harmonics are brightest and pitch estimates are noisiest. Collecting only
      // from frames after ATTACK_SKIP_FRAMES gives a cleaner median measurement.
      if (stableFrames.current > ATTACK_SKIP_FRAMES) {
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
      if (stableFrames.current >= STABLE_FRAMES_REQUIRED && !justRegistered.current) {
        registerNote();
      }
    } else if (anchor === null) {
      // No anchor yet — first detected frame; initialise the stability window.
      lastPitchClass.current = pitchClass;
      stableFrames.current = 1;
      stableFrequencies.current = [];
      stableOctaveFreqs.current = [];
      stableCFifthFreqs.current = [];
      competingFrames.current = 0;
    } else {
      // Different pitch class from the current anchor.
      // Don't reset immediately — brief stray detections (sympathetic resonance,
      // room noise, a single octave-slip frame) typically last only 1–3 frames.
      // Only switch the anchor and reset the counter after COMPETING_RESET_THRESHOLD
      // consecutive frames of the new pitch class, indicating a genuine note change.
      competingFrames.current += 1;
      if (competingFrames.current >= COMPETING_RESET_THRESHOLD) {
        lastPitchClass.current = pitchClass;
        stableFrames.current = 1;
        stableFrequencies.current = [];
        stableOctaveFreqs.current = [];
        stableCFifthFreqs.current = [];
        competingFrames.current = 0;
      }
      // Below the threshold: skip silently — the accumulated progress is preserved.
    }
  }, [result, isListening, registerNote, resetStabilityState]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;
  const stabilityPct = stableFrames.current > 0
    ? Math.min(100, Math.round((stableFrames.current / STABLE_FRAMES_REQUIRED) * 100))
    : 0;
  const noiseBadge = result.rmsDb !== null
    ? getNoiseBadge(result.rmsDb, result.frequency !== null)
    : null;

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
        <p className={`note-instruction${stabilityPct > 0 && stabilityPct < 100 ? ' note-instruction--active' : ''}`}>
          {stabilityPct > 0 && stabilityPct < 100
            ? '🎵 Keep striking the note — building your reading…'
            : 'Hold the note ringing — it will be auto-registered'}
        </p>
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

      {noiseBadge && (
        <div className={`noise-badge ${noiseBadge.cls}`}>{noiseBadge.label}</div>
      )}

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
