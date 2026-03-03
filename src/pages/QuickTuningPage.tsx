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
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const ATTACK_SKIP_FRAMES = 0;

// Minimum number of sustain-phase frequency samples required before registration.
// Even if confidence exceeds the threshold earlier, we wait for enough measurements
// to produce a reliable trimmed mean.
const MIN_FREQ_SAMPLES = 1;

// Lock quality threshold for registering a note (0–1)
const LOCK_THRESHOLD = IS_IOS ? 0.70 : 0.75;


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
  const { isListening, result, error, startListening, stopListening, debugInfo } = useAudioProcessor();

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

  const resetStabilityState = useCallback(() => {
    stableFrequencies.current = [];
    stableOctaveFreqs.current = [];
    stableCFifthFreqs.current = [];
  }, []);
  const registeredCount = state.tuningResults.filter(
    r => r.status !== 'pending'
  ).length;

  useEffect(() => {
    // Reset stability when not listening or during post-registration cooldown.
    if (!isListening || justRegistered.current) {
      resetStabilityState();
      return;
    }
    if (result.frequency === null || result.noteName === null) {
      return;
    }

    // Skip frames for notes that are already registered (prevents long ring-out from blocking new notes)
    if (registeredNoteNames.current.has(result.noteName)) {
      return;
    }

    const lockQ = result.lockQuality ?? 0;

    // Collect a small set of stable frames only when lock quality is decent.
    // The audio hook already ignores the attack transient and locks using median+MAD,
    // so we can collect immediately (no extra attack skip needed).
    if (lockQ >= 0.55) {
      stableFrequencies.current.push(result.frequency);
      if (result.octaveFrequency !== null) stableOctaveFreqs.current.push(result.octaveFrequency);
      if (result.compoundFifthFrequency !== null) stableCFifthFreqs.current.push(result.compoundFifthFrequency);
    }

    // Register when lock is strong enough and we have at least one measurement
    if (
      lockQ >= LOCK_THRESHOLD &&
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
  // Stability ring shows the audio lock quality (0–100%)
  const lockQuality = result.lockQuality ?? 0;
  const stabilityPct = Math.round(lockQuality * 100);

  return (
  <>
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

    {DEBUG && debugInfo && (
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          right: 12,
          padding: 12,
          background: 'rgba(0,0,0,0.85)',
          color: '#00ff66',
          fontSize: 12,
          borderRadius: 10,
          zIndex: 9999,
          lineHeight: 1.35,
          fontFamily: 'monospace',
        }}
      >
        <div>audio: {debugInfo.audioState}</div>
        <div>rms: {debugInfo.rms.toFixed(4)} (peak {debugInfo.rmsPeak.toFixed(4)})</div>
        <div>noise: {debugInfo.noiseFloor.toFixed(4)}</div>
        <div>waiting: {String(debugInfo.waitingStabilization)}</div>
        <div>note: {debugInfo.noteName ?? '—'} score: {debugInfo.matchScore.toFixed(2)}</div>
        <div>
          freq: {debugInfo.rawFreq ? debugInfo.rawFreq.toFixed(2) : '—'} →{' '}
          {debugInfo.smoothedFreq ? debugInfo.smoothedFreq.toFixed(2) : '—'}
        </div>
        <div>reject: {debugInfo.rejectReason || '—'}</div>
      </div>
    )}
  </>
);
};

export default QuickTuningPage;
