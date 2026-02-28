import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { CentsGauge } from '../components/CentsGauge';
import { midiToFrequency, formatCents, centsToColor, frequencyToNote } from '../utils/musicUtils';
import type { TuningResult } from '../contexts/AppContext';

// Auto-register a note after this many consecutive stable frames.
// At ~60fps this is approximately 0.75 seconds; actual time depends on
// the requestAnimationFrame rate used by the useAudioProcessor hook.
const STABLE_FRAMES_REQUIRED = 45;

// Cooldown in ms before the next note can be registered after one is confirmed
const REGISTRATION_COOLDOWN_MS = 1500;

// Number of stable frames to skip before collecting frequencies for the median.
// The initial transient of a handpan note (attack phase) has the brightest harmonics
// and the most noise in the fundamental estimate. Skipping the first ~15 frames
// (~250 ms at 60 fps) avoids this region and collects only from the cleaner sustain
// phase — mirroring the behaviour of professional strobe tuners like Linotune, which
// begin reading approximately 1 second after the note is struck.
const ATTACK_SKIP_FRAMES = 15;

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
  const lastPitchClass = useRef<string | null>(null);
  const stableFrequencies = useRef<number[]>([]);
  const justRegistered = useRef(false);
  // Tracks full note names (e.g. "A3", "D3") already registered this session to prevent
  // duplicates. Using full name rather than pitch class avoids blocking D2 and D3 (both
  // class "D") from registering as distinct notes.
  const registeredNoteNames = useRef<Set<string>>(new Set());

  const resetStabilityState = useCallback(() => {
    stableFrames.current = 0;
    lastPitchClass.current = null;
    stableFrequencies.current = [];
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

    // Trimmed mean of the central 50%: sort the collected frequencies, discard the outer
    // 25% on each side (removing occasional octave-error outliers), then average the rest.
    // Compared to taking a single median element this reduces random YIN noise by
    // √(n/2) — e.g. √15 ≈ 3.9× for 30 sustain frames — bringing the measurement much
    // closer to the true frequency of the sustained note.
    const sorted = [...stableFrequencies.current].sort((a, b) => a - b);
    let midpointFreq: number | null = null;
    if (sorted.length > 0) {
      const trimCount = Math.floor(sorted.length * 0.25);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      midpointFreq = trimmed.length > 0
        ? trimmed.reduce((sum, f) => sum + f, 0) / trimmed.length
        : sorted[Math.floor((sorted.length - 1) / 2)];
    }

    const detectedFreq = midpointFreq ?? result.frequency;

    if (detectedFreq === null) return;

    // Derive note name and cents consistently from the median frequency.
    // Taking result.cents / result.noteName from the current frame at registration time
    // introduces noise because that frame may be an attack or ring-out outlier. Using
    // frequencyToNote(detectedFreq) ensures the logged cents and note name always match
    // the frequency that was actually stored — eliminating multi-cent errors like +12¢
    // that appear when the last frame in the window is noisy.
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

    // Compute compound fifth partial (3× fundamental, i.e. one octave + perfect fifth)
    // 19 semitones = 12 (octave) + 7 (perfect fifth)
    const compoundFifthFreq = detectedFreq * 3;
    const midiFloat = 12 * Math.log2(detectedFreq / 440) + 69;
    const midiNote = Math.round(midiFloat);
    // ET target for the compound fifth note (19 semitones above the fundamental)
    const targetCompoundFifthFreq = midiToFrequency(midiNote + 19);
    const compoundFifthCents = 1200 * Math.log2(compoundFifthFreq / targetCompoundFifthFreq);

    // Compute octave partial (2× fundamental, 12 semitones above)
    const octaveFreq = detectedFreq * 2;
    const targetOctaveFreq = midiToFrequency(midiNote + 12);
    const octaveCents = 1200 * Math.log2(octaveFreq / targetOctaveFreq);

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
    // Reset and hold at 0% when not listening, no signal, or during the post-registration
    // cooldown — the cooldown guard prevents the still-ringing note from rebuilding the
    // ring to a confusing partial percentage before the user plays the next note.
    if (!isListening || result.frequency === null || result.noteName === null || justRegistered.current) {
      resetStabilityState();
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
      stableFrames.current += 1;
      // Skip attack-phase frames: only collect frequencies from the sustain phase.
      // The first ATTACK_SKIP_FRAMES of each stable window cover the initial transient
      // where harmonics are brightest and pitch estimates are noisiest. Collecting only
      // from frames after ATTACK_SKIP_FRAMES gives a cleaner median measurement.
      if (stableFrames.current > ATTACK_SKIP_FRAMES) {
        stableFrequencies.current.push(result.frequency);
      }
      if (stableFrames.current >= STABLE_FRAMES_REQUIRED && !justRegistered.current) {
        registerNote();
      }
    } else {
      lastPitchClass.current = pitchClass;
      stableFrames.current = 1;
      stableFrequencies.current = [];
    }
  }, [result, isListening, registerNote, resetStabilityState]);

  const progressPct = notesCount > 0 ? (registeredCount / notesCount) * 100 : 0;
  const statusColor = result.cents !== null ? centsToColor(result.cents) : '#555';
  const absCents = result.cents !== null ? Math.abs(result.cents) : null;
  const currentStatus = absCents !== null ? getTuningStatus(absCents) : null;
  const stabilityPct = stableFrames.current > 0
    ? Math.min(100, Math.round((stableFrames.current / STABLE_FRAMES_REQUIRED) * 100))
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
