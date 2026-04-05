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
const FEED_MAX_ENTRIES = 12;
const HIGH_NOTE_OCTAVE_ONLY_MIDI = 76;
const ACTIVE_GATE_CENTS = 85;
const STRONG_LOCK_CENTS = 10;

function midiFromSelection(semitone: number, octave: number): number {
  return (octave + 1) * 12 + semitone;
}

function hasLiveValue(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

function statusText(isListening: boolean, hasSignal: boolean, strongLock: boolean, targetLabel: string): string {
  if (!isListening) return 'Starting microphone…';
  if (strongLock) return `Locked to ${targetLabel}`;
  if (hasSignal) return `Tracking ${targetLabel} continuously`;
  return `Listening for ${targetLabel}`;
}

const MakerStrobePage: React.FC = () => {
  const [pitchClass, setPitchClass] = useState<string>('D');
  const [octave, setOctave] = useState<number>(3);
  const [showCompoundFifth, setShowCompoundFifth] = useState(true);
  const [liveFeed, setLiveFeed] = useState<LiveSample[]>([]);
  const feedIdRef = useRef(0);

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

  const { isListening, error, amplitude, confidence, cents } = useContinuousTargetStrobe(
    targetFundamental,
    targetOctave,
    targetCompoundFifth,
    compoundFifthEnabled,
  );

  const hasSignal = hasLiveValue(cents.fundamental);
  const withinGate = hasSignal && Math.abs(cents.fundamental as number) <= ACTIVE_GATE_CENTS;
  const strongLock = hasSignal && Math.abs(cents.fundamental as number) <= STRONG_LOCK_CENTS;
  const bandsActive = isListening;

  useEffect(() => {
    if (!hasSignal) return;

    const nextEntry: LiveSample = {
      id: ++feedIdRef.current,
      fundamental: cents.fundamental,
      octave: cents.octave,
      compoundFifth: compoundFifthEnabled ? cents.compoundFifth : null,
    };

    setLiveFeed((current) => {
      const previous = current[0];
      const isTooClose = previous && previous.fundamental !== null && nextEntry.fundamental !== null
        ? Math.abs(previous.fundamental - nextEntry.fundamental) < 0.15
        : false;
      if (isTooClose) return current;
      return [nextEntry, ...current].slice(0, FEED_MAX_ENTRIES);
    });
  }, [cents.fundamental, cents.octave, cents.compoundFifth, hasSignal, compoundFifthEnabled]);

  useEffect(() => {
    setLiveFeed([]);
  }, [pitchClass, octave, compoundFifthEnabled]);

  return (
    <div className="page maker-strobe-page">
      <div className="maker-strobe-shell">
        <div className="maker-strobe-header">
          <div>
            <p className="maker-strobe-eyebrow">Maker mode</p>
            <h1 className="maker-strobe-title">Target-locked strobe tuner</h1>
            <p className="maker-strobe-subtitle">
              The bands now run from a dedicated continuous stream. They stay alive while the mic is on, and react directly to live cents instead of the slower strike-lock logic.
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
          <div className={`maker-strobe-status ${strongLock ? 'strong' : withinGate ? 'tracking' : ''}`}>
            {statusText(isListening, hasSignal, strongLock, targetLabel)}
          </div>
        </div>

        <div className="maker-strobe-layout">
          <div className="maker-strobe-visualizer">
            <MakerStrobeBands label="Fundamental" cents={cents.fundamental} active={bandsActive} />
            <MakerStrobeBands label="Octave" cents={cents.octave} active={bandsActive} />
            <MakerStrobeBands label="Compound fifth" cents={compoundFifthEnabled ? cents.compoundFifth : null} active={bandsActive} />
          </div>

          <div className="maker-strobe-sidebar">
            <div className="maker-strobe-live-card">
              <h2>Live cents</h2>
              <div className="maker-live-row">
                <span>Fundamental</span>
                <strong style={{ color: cents.fundamental !== null ? centsToColor(cents.fundamental) : '#93a4bb' }}>
                  {cents.fundamental !== null ? formatCents(cents.fundamental) : '—'}
                </strong>
              </div>
              <div className="maker-live-row">
                <span>Octave</span>
                <strong style={{ color: cents.octave !== null ? centsToColor(cents.octave) : '#93a4bb' }}>
                  {cents.octave !== null ? formatCents(cents.octave) : '—'}
                </strong>
              </div>
              <div className="maker-live-row">
                <span>Compound fifth</span>
                <strong style={{ color: cents.compoundFifth !== null ? centsToColor(cents.compoundFifth) : '#93a4bb' }}>
                  {compoundFifthEnabled
                    ? cents.compoundFifth !== null
                      ? formatCents(cents.compoundFifth)
                      : '—'
                    : 'N/A'}
                </strong>
              </div>
              <div className="maker-strobe-hint">
                Confidence {(confidence * 100).toFixed(0)}% · RMS {amplitude.toFixed(4)}
              </div>
              {error ? <div className="maker-strobe-hint" style={{ color: '#ffb1b1', marginTop: 10 }}>{error}</div> : null}
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

        <p className="maker-strobe-footer-note">
          This mode is now intentionally separate from the certified strike detector. It favors continuous response and visual immediacy over the slower lock-and-aggregate behaviour used elsewhere in the app.
        </p>
      </div>
    </div>
  );
};

export default MakerStrobePage;
