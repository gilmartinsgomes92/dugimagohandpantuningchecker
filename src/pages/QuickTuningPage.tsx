import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor, frequencyToNote } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Time-based thresholds — device and framerate independent.
// Using wall-clock milliseconds rather than frame counts means the behaviour is
// identical on a 60 fps desktop and a 30 fps mobile browser (iOS Safari, older
// Android Chrome) which previously needed 2× as many strikes to fill the bar.

// Auto-register a note after this many milliseconds of valid detections.
const STABLE_DURATION_MS = 800;

// Milliseconds of a *different* pitch class required before the stability counter
// is reset. Brief stray detections (sympathetic resonance, room noise) typically
// last only 50–100 ms; a genuine new note produces a sustained run.
const COMPETING_RESET_MS = 130;

// On iPhone, iOS AGC amplifies upper harmonics of low notes (D3, A3, A#3) during
// natural decay. The 3rd harmonic of D3 (147 Hz) is A4 (441 Hz), and AGC can make
// it temporarily dominate the spectrum, causing YIN to detect A4 rather than D3.
// Similarly, F4 (349 Hz) and its 2nd harmonic F5 (698 Hz) alternate on both desktop
// and mobile, causing the stability counter to keep resetting at 130 ms.
// When the competing pitch is an integer harmonic (2×–5×) of the current anchor,
// we allow a much longer window before resetting, because AGC bursts on real
// handpan notes typically last < 400 ms. A genuine note change at a harmonic
// interval still succeeds after HARMONIC_COMPETING_RESET_MS.
const HARMONIC_COMPETING_RESET_MS = 500;

// After this many milliseconds of continuous silence, clear the anchor frequency
// used for harmonic detection. This prevents the harmonic filter from blocking
// the next note when the user switches after a fully-decayed note.
const ANCHOR_FREQ_SILENCE_RESET_MS = 250;

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;

// Milliseconds of the attack transient to skip before collecting frequencies.
// The first ~300 ms of a handpan note has the brightest harmonics and noisiest
// pitch estimate; collecting only from the sustain phase gives a cleaner reading.
const ATTACK_SKIP_MS = 300;

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

  // Accumulated milliseconds of valid detections for the current anchor pitch class.
  const stableTimeMs = useRef(0);
  // Accumulated milliseconds of detections for a *competing* (different) pitch class.
  const competingTimeMs = useRef(0);
  // Timestamp (performance.now()) of the last valid detected frame, used to compute
  // inter-frame delta time. Reset to null on silence / anchor change so the first
  // post-silence frame contributes a sensible default delta instead of a huge gap.
  const lastValidFrameTime = useRef<number | null>(null);
  const lastPitchClass = useRef<string | null>(null);
  // Frequency (Hz) of the current anchor note, used to classify competing-pitch
  // detections as harmonic vs. genuine new note. Integer harmonics (2×–5×) of the
  // anchor are treated with a longer reset threshold so AGC-amplified partials
  // (and the F4/F5 octave alternation on desktop) don't keep resetting the bar.
  const lastAnchorFreq = useRef<number | null>(null);
  // Timestamp (performance.now()) when a continuous silence run began. Used to
  // expire lastAnchorFreq after the note has fully decayed.
  const silenceStartTime = useRef<number | null>(null);
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
    stableTimeMs.current = 0;
    competingTimeMs.current = 0;
    lastValidFrameTime.current = null;
    lastPitchClass.current = null;
    lastAnchorFreq.current = null;
    silenceStartTime.current = null;
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
  // octave) is detected for STABLE_DURATION_MS of accumulated valid frames. Using pitch
  // class rather than exact note name or frequency makes the counter robust against the
  // octave jumps that the YIN algorithm produces on handpan harmonics (e.g. A3 ↔ A2).
  // All timing uses wall-clock milliseconds so behaviour is identical across devices
  // regardless of whether requestAnimationFrame fires at 60 fps (desktop) or 30 fps (mobile).
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
    // Also reset lastValidFrameTime so that when the note is detected again after silence
    // the first new frame contributes a clean 16 ms default delta rather than the full
    // silence gap (which would inflate stableTimeMs).
    if (result.frequency === null || result.noteName === null) {
      // Track sustained silence to expire the harmonic-anchor frequency after the note
      // has fully decayed. Brief null frames (< ANCHOR_FREQ_SILENCE_RESET_MS) leave
      // lastAnchorFreq intact so the harmonic filter keeps working through the
      // micro-gaps that appear during a handpan note's natural envelope. Once the note
      // is truly done (> ANCHOR_FREQ_SILENCE_RESET_MS of continuous silence), clear the
      // anchor so the next note starts without any harmonic-filter bias.
      if (silenceStartTime.current === null) {
        silenceStartTime.current = performance.now();
      } else if (performance.now() - silenceStartTime.current > ANCHOR_FREQ_SILENCE_RESET_MS) {
        lastAnchorFreq.current = null;
      }
      lastValidFrameTime.current = null;
      return;
    }
    // Active detection — clear the silence timer.
    silenceStartTime.current = null;

    // Transparently skip frames where the detected note is already registered.
    // This prevents ring-out of a previously-registered note (which can last 5–10 s on a
    // handpan) from either (a) accumulating false stability that re-triggers the duplicate
    // guard on every 45-frame window, or (b) resetting the stability counter for the note
    // the user is actually playing next. Skipped frames leave the counter unchanged so that
    // isolated ring-out blips interleaved with the new note do not break accumulation.
    if (registeredNoteNames.current.has(result.noteName)) {
      return;
    }

    // Compute wall-clock delta since the last valid frame.
    // Cap at 100 ms to prevent a tab-switch or audio-context suspension from adding a
    // huge single-frame jump. Typical frame interval is 16–33 ms; 100 ms is generous.
    const now = performance.now();
    const frameDelta = lastValidFrameTime.current !== null
      ? Math.min(now - lastValidFrameTime.current, 100)
      : 16; // default to ~60 fps interval for the very first frame
    lastValidFrameTime.current = now;

    // Strip the trailing octave digit(s) to get the pitch class, e.g. "A3" → "A", "D#4" → "D#"
    const pitchClass = result.noteName.replace(/\d+$/, '');
    const anchor = lastPitchClass.current;

    if (anchor !== null && pitchClass === anchor) {
      // This frame matches the current anchor — reset the competing-pitch timer.
      competingTimeMs.current = 0;
      stableTimeMs.current += frameDelta;
      // Skip attack-phase frames: only collect frequencies from the sustain phase.
      // The first ATTACK_SKIP_MS cover the initial transient where harmonics are
      // brightest and pitch estimates are noisiest. Collecting only from frames after
      // ATTACK_SKIP_MS gives a cleaner median measurement.
      if (stableTimeMs.current > ATTACK_SKIP_MS) {
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
      if (stableTimeMs.current >= STABLE_DURATION_MS && !justRegistered.current) {
        registerNote();
      }
    } else if (anchor === null) {
      // No anchor yet — first detected frame; initialise the stability window.
      lastPitchClass.current = pitchClass;
      lastAnchorFreq.current = result.frequency;
      stableTimeMs.current = frameDelta;
      stableFrequencies.current = [];
      stableOctaveFreqs.current = [];
      stableCFifthFreqs.current = [];
      competingTimeMs.current = 0;
    } else {
      // Different pitch class from the current anchor.
      // Before counting as competing, check whether the detected frequency is an
      // integer harmonic (2×–5×) of the anchor. On iPhone, iOS AGC amplifies upper
      // harmonics of low notes during natural decay — D3 (147 Hz) has its 3rd harmonic
      // at A4 (441 Hz), A3 at E5, A#3 at F5. On any device, F4 (349 Hz) and its 2nd
      // harmonic F5 (698 Hz) alternate causing the stability bar to keep resetting.
      // For harmonic-class competing runs, use a longer threshold (500 ms) so these
      // AGC or YIN octave-slip bursts are absorbed. A genuine note change at a harmonic
      // interval still succeeds after HARMONIC_COMPETING_RESET_MS.
      const anchorFreq = lastAnchorFreq.current;
      const detectedFreq = result.frequency;
      const isHarmonicCompeting = anchorFreq !== null && [2, 3, 4, 5].some(n => {
        const ratio = detectedFreq / anchorFreq;
        // Check both directions: competing is n× anchor OR anchor is n× competing.
        return (
          Math.abs(1200 * Math.log2(ratio / n)) < 100 ||
          Math.abs(1200 * Math.log2(ratio * n)) < 100
        );
      });
      // Don't reset immediately — brief stray detections (sympathetic resonance,
      // room noise, a single octave-slip frame) typically last only 50–100 ms.
      // Only switch the anchor and reset the counter after the effective threshold
      // of the new pitch class, indicating a genuine note change.
      const resetThreshold = isHarmonicCompeting ? HARMONIC_COMPETING_RESET_MS : COMPETING_RESET_MS;
      competingTimeMs.current += frameDelta;
      if (competingTimeMs.current >= resetThreshold) {
        lastPitchClass.current = pitchClass;
        lastAnchorFreq.current = result.frequency;
        stableTimeMs.current = frameDelta;
        stableFrequencies.current = [];
        stableOctaveFreqs.current = [];
        stableCFifthFreqs.current = [];
        competingTimeMs.current = 0;
      }
      // Below the threshold: skip silently — the accumulated progress is preserved.
    }
  }, [result, isListening, registerNote, resetStabilityState]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;
  const stabilityPct = stableTimeMs.current > 0
    ? Math.min(100, Math.round((stableTimeMs.current / STABLE_DURATION_MS) * 100))
    : 0;

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
            ? '🎵 Keep the note ringing — building your reading…'
            : 'Strike a note — it will be auto-registered'}
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
