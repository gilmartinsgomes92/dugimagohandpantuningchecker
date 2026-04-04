import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MakerStrobeBands from '../components/MakerStrobeBands';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { centsDeviation, centsToColor, formatCents, midiToFrequency } from '../utils/musicUtils';

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
const ACTIVATE_GATE_CENTS = 70;
const STRONG_LOCK_GATE_CENTS = 28;
const FEED_MAX_ENTRIES = 12;
const HIGH_NOTE_OCTAVE_ONLY_MIDI = 76;

function midiFromSelection(semitone: number, octave: number): number {
  return (octave + 1) * 12 + semitone;
}

function deviationOrNull(detected: number | null, target: number): number | null {
  if (detected === null || detected <= 0 || target <= 0) return null;
  return centsDeviation(detected, target);
}

function statusText(active: boolean, strongLock: boolean, targetLabel: string): string {
  if (strongLock) return `Locked to ${targetLabel}`;
  if (active) return `Tracking around ${targetLabel}`;
  return `Waiting for ${targetLabel}`;
}

const MakerStrobePage: React.FC = () => {
  const [pitchClass, setPitchClass] = useState<string>('D');
  const [octave, setOctave] = useState<number>(3);
  const [showCompoundFifth, setShowCompoundFifth] = useState(true);
  const { isListening, result, error, startListening, stopListening } = useAudioProcessor();
  const feedIdRef = useRef(0);
  const [liveFeed, setLiveFeed] = useState<LiveSample[]>([]);

  useEffect(() => {
    void startListening();
    return () => {
      stopListening();
    };
  }, [startListening, stopListening]);

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

  const fundamentalCents = useMemo(
    () => deviationOrNull(result.frequency, targetFundamental),
    [result.frequency, targetFundamental],
  );
  const octaveCents = useMemo(
    () => deviationOrNull(result.octaveFrequency, targetOctave),
    [result.octaveFrequency, targetOctave],
  );
  const compoundFifthCents = useMemo(
    () => deviationOrNull(result.compoundFifthFrequency, targetCompoundFifth),
    [result.compoundFifthFrequency, targetCompoundFifth],
  );

  const withinGate = fundamentalCents !== null && Math.abs(fundamentalCents) <= ACTIVATE_GATE_CENTS;
  const strongLock = fundamentalCents !== null && Math.abs(fundamentalCents) <= STRONG_LOCK_GATE_CENTS;
  const displayedFundamentalCents = withinGate ? fundamentalCents : null;
  const displayedOctaveCents = withinGate ? octaveCents : null;
  const displayedCompoundFifthCents = withinGate && compoundFifthEnabled ? compoundFifthCents : null;

  useEffect(() => {
    if (!withinGate) return;
    setLiveFeed((current) => {
      const nextEntry: LiveSample = {
        id: ++feedIdRef.current,
        fundamental: displayedFundamentalCents,
        octave: displayedOctaveCents,
        compoundFifth: displayedCompoundFifthCents,
      };
      return [nextEntry, ...current].slice(0, FEED_MAX_ENTRIES);
    });
  }, [withinGate, displayedFundamentalCents, displayedOctaveCents, displayedCompoundFifthCents]);

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
              Choose the note first, then play that tonefield. The three vertical bands respond live only when the detected pitch is close to the selected target.
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
            {statusText(withinGate, strongLock, targetLabel)}
          </div>
        </div>

        <div className="maker-strobe-layout">
          <div className="maker-strobe-visualizer">
            <MakerStrobeBands label="Fundamental" cents={displayedFundamentalCents} active={withinGate} />
            <MakerStrobeBands label="Octave" cents={displayedOctaveCents} active={withinGate && displayedOctaveCents !== null} />
            <MakerStrobeBands
              label="Compound fifth"
              cents={displayedCompoundFifthCents}
              active={withinGate && compoundFifthEnabled && displayedCompoundFifthCents !== null}
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
                The strobe wakes up when the detected pitch is within about ±{ACTIVATE_GATE_CENTS}¢ of {targetLabel}.
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
          {error
            ? `Microphone error: ${error}`
            : isListening
              ? 'Mic is live. Strike and hold the selected note so the bands can settle.'
              : 'Starting microphone…'}
        </div>
      </div>
    </div>
  );
};

export default MakerStrobePage;
