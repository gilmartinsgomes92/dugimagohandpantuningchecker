import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MakerStrobeBands from '../components/MakerStrobeBands';
import { useContinuousTargetStrobe } from '../hooks/useContinuousTargetStrobe';
import { centsToColor, formatCents, midiToFrequency } from '../utils/musicUtils';

type PitchClassOption = { value: string; label: string; semitone: number };
type LiveSample = {
  id: number;
  fundamental: number | null;
  octave: number | null;
  compoundFifth: number | null;
};

const NOTE_OPTIONS: PitchClassOption[] = [
  { value: 'C', label: 'C', semitone: 0 },
  { value: 'C#', label: 'Db / C#', semitone: 1 },
  { value: 'D', label: 'D', semitone: 2 },
  { value: 'D#', label: 'Eb / D#', semitone: 3 },
  { value: 'E', label: 'E', semitone: 4 },
  { value: 'F', label: 'F', semitone: 5 },
  { value: 'F#', label: 'F# / Gb', semitone: 6 },
  { value: 'G', label: 'G', semitone: 7 },
  { value: 'G#', label: 'Ab / G#', semitone: 8 },
  { value: 'A', label: 'A', semitone: 9 },
  { value: 'A#', label: 'Bb / A#', semitone: 10 },
  { value: 'B', label: 'B', semitone: 11 },
];

const OCTAVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const STRONG_LOCK_GATE_CENTS = 4;
const TRACKING_GATE_CENTS = 18;
const FEED_MAX_ENTRIES = 12;
const HIGH_NOTE_OCTAVE_ONLY_MIDI = 76;
const LIVE_FEED_MIN_INTERVAL_MS = 90;

function midiFromSelection(semitone: number, octave: number): number {
  return (octave + 1) * 12 + semitone;
}

function statusText(active: boolean, tracking: boolean, strongLock: boolean, targetLabel: string): string {
  if (strongLock) return `Locked to ${targetLabel}`;
  if (tracking) return `Tracking around ${targetLabel}`;
  if (active) return `Listening for ${targetLabel}`;
  return `Idle strobe — play ${targetLabel}`;
}

const MakerStrobePage: React.FC = () => {
  const [pitchClass, setPitchClass] = useState<string>('D');
  const [octave, setOctave] = useState<number>(3);
  const [showCompoundFifth, setShowCompoundFifth] = useState(true);
  const feedIdRef = useRef(0);
  const lastFeedPushMsRef = useRef(0);
  const [liveFeed, setLiveFeed] = useState<LiveSample[]>([]);

  const selectedPitchClass = useMemo(
    () => NOTE_OPTIONS.find((option) => option.value === pitchClass) ?? NOTE_OPTIONS[2],
    [pitchClass],
  );

  const selectedMidi = useMemo(
    () => midiFromSelection(selectedPitchClass.semitone, octave),
    [octave, selectedPitchClass.semitone],
  );

  const targetFundamental = useMemo(() => midiToFrequency(selectedMidi), [selectedMidi]);
  const targetOctave = useMemo(() => midiToFrequency(selectedMidi + 12), [selectedMidi]);
  const targetCompoundFifth = useMemo(() => midiToFrequency(selectedMidi + 19), [selectedMidi]);
  const targetLabel = `${selectedPitchClass.value}${octave}`;
  const isOctaveOnlyDefault = selectedMidi >= HIGH_NOTE_OCTAVE_ONLY_MIDI;
  const compoundFifthEnabled = showCompoundFifth && !isOctaveOnlyDefault;

  const strobe = useContinuousTargetStrobe(
    targetFundamental,
    targetOctave,
    targetCompoundFifth,
  );

  const displayedFundamentalCents = strobe.fundamental.cents;
  const displayedOctaveCents = strobe.octave.cents;
  const displayedCompoundFifthCents = compoundFifthEnabled ? strobe.compoundFifth.cents : null;

  const hasSignal = strobe.fundamental.active || strobe.octave.active || (compoundFifthEnabled && strobe.compoundFifth.active);
  const tracking = displayedFundamentalCents !== null && Math.abs(displayedFundamentalCents) <= TRACKING_GATE_CENTS;
  const strongLock = displayedFundamentalCents !== null && Math.abs(displayedFundamentalCents) <= STRONG_LOCK_GATE_CENTS;

  useEffect(() => {
    const now = performance.now();
    if (!hasSignal || now - lastFeedPushMsRef.current < LIVE_FEED_MIN_INTERVAL_MS) return;

    lastFeedPushMsRef.current = now;
    setLiveFeed((current) => {
      const nextEntry: LiveSample = {
        id: ++feedIdRef.current,
        fundamental: displayedFundamentalCents,
        octave: displayedOctaveCents,
        compoundFifth: displayedCompoundFifthCents,
      };
      return [nextEntry, ...current].slice(0, FEED_MAX_ENTRIES);
    });
  }, [hasSignal, displayedFundamentalCents, displayedOctaveCents, displayedCompoundFifthCents]);

  useEffect(() => {
    setLiveFeed([]);
    lastFeedPushMsRef.current = 0;
  }, [pitchClass, octave, compoundFifthEnabled]);

  return (
    <div className="page maker-strobe-page">
      <div className="maker-strobe-shell">
        <div className="maker-strobe-header">
          <div>
            <p className="maker-strobe-eyebrow">Maker mode</p>
            <h1 className="maker-strobe-title">Target-locked strobe tuner</h1>
            <p className="maker-strobe-subtitle">
              Choose the note first, then play that tonefield. The three vertical bands now run continuously and react directly to the live target-locked cents stream instead of waiting for full note registration.
            </p>
          </div>
          <Link className="maker-strobe-back" to="/">
            ← Back to home
          </Link>
        </div>

        <div className="maker-strobe-controls">
          <label className="maker-strobe-control">
            <span>Pitch class</span>
            <select value={pitchClass} onChange={(event) => setPitchClass(event.target.value)}>
              {NOTE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-strobe-control">
            <span>Octave</span>
            <select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>
              {OCTAVE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-strobe-toggle">
            <input
              type="checkbox"
              checked={compoundFifthEnabled}
              onChange={(event) => setShowCompoundFifth(event.target.checked)}
              disabled={isOctaveOnlyDefault}
            />
            <span>Show compound fifth band</span>
          </label>
        </div>

        <div className="maker-strobe-target-card">
          <div>
            <div className="maker-strobe-target-label">Selected target</div>
            <div className="maker-strobe-target-note">{targetLabel}</div>
          </div>
          <div className="maker-strobe-target-meta">
            <div>F0 {targetFundamental.toFixed(2)} Hz</div>
            <div>8ve {targetOctave.toFixed(2)} Hz</div>
            <div>{compoundFifthEnabled ? `12th ${targetCompoundFifth.toFixed(2)} Hz` : '12th hidden'}</div>
          </div>
          <div className={`maker-strobe-status ${strongLock ? 'strong' : tracking ? 'tracking' : ''}`}>
            {statusText(hasSignal, tracking, strongLock, targetLabel)}
          </div>
        </div>

        <div className="maker-strobe-layout">
          <div className="maker-strobe-visualizer">
            <MakerStrobeBands label="Fundamental" cents={displayedFundamentalCents} active={strobe.fundamental.active} />
            <MakerStrobeBands label="Octave" cents={displayedOctaveCents} active={strobe.octave.active} />
            <MakerStrobeBands
              label="Compound fifth"
              cents={displayedCompoundFifthCents}
              active={compoundFifthEnabled && strobe.compoundFifth.active}
            />
          </div>

          <div className="maker-strobe-sidebar">
            <div className="maker-strobe-live-card">
              <h2>Live cents</h2>
              <div className="maker-live-row">
                <span>Fundamental</span>
                <strong style={{ color: displayedFundamentalCents !== null ? centsToColor(displayedFundamentalCents) : '#93a4bb' }}>
                  {displayedFundamentalCents !== null ? formatCents(displayedFundamentalCents) : '—'}
                </strong>
              </div>
              <div className="maker-live-row">
                <span>Octave</span>
                <strong style={{ color: displayedOctaveCents !== null ? centsToColor(displayedOctaveCents) : '#93a4bb' }}>
                  {displayedOctaveCents !== null ? formatCents(displayedOctaveCents) : '—'}
                </strong>
              </div>
              <div className="maker-live-row">
                <span>Compound fifth</span>
                <strong style={{ color: displayedCompoundFifthCents !== null ? centsToColor(displayedCompoundFifthCents) : '#93a4bb' }}>
                  {compoundFifthEnabled
                    ? displayedCompoundFifthCents !== null
                      ? formatCents(displayedCompoundFifthCents)
                      : '—'
                    : 'N/A'}
                </strong>
              </div>
              <div className="maker-strobe-hint">
                Bands stay alive even when no pitch is detected. When a pitch enters the target window, motion direction follows the sign of the cents error and speed slows as it approaches 0¢.
              </div>
            </div>

            <div className="maker-strobe-live-card maker-strobe-feed-card">
              <h2>Live deviation feed</h2>
              <div className="maker-strobe-feed-list">
                {liveFeed.length === 0 ? (
                  <p className="maker-strobe-feed-empty">Play {targetLabel} to start the live cents feed.</p>
                ) : (
                  liveFeed.map((sample) => (
                    <div key={sample.id} className="maker-strobe-feed-row">
                      <span>{sample.fundamental !== null ? formatCents(sample.fundamental) : '—'}</span>
                      <span>{sample.octave !== null ? formatCents(sample.octave) : '—'}</span>
                      <span>{compoundFifthEnabled ? (sample.compoundFifth !== null ? formatCents(sample.compoundFifth) : '—') : 'N/A'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="maker-strobe-footer-note">
          {strobe.error
            ? `Microphone error: ${strobe.error}`
            : strobe.isListening
              ? 'Mic is live. The strobe now listens continuously; strike and hold the selected note to see the motion lock in.'
              : 'Starting microphone…'}
        </div>
      </div>
    </div>
  );
};

export default MakerStrobePage;
