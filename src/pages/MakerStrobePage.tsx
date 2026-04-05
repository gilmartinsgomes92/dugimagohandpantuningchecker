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
const FEED_MAX_ENTRIES = 10;
const HIGH_NOTE_OCTAVE_ONLY_MIDI = 76;
const STRONG_LOCK_CENTS = 10;
const LIVE_CONFIDENCE_THRESHOLD = 0.14;

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
  const [compactBands, setCompactBands] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 820;
  });
  const feedIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setCompactBands(window.innerWidth <= 820);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const hasSignal = confidence >= LIVE_CONFIDENCE_THRESHOLD && hasLiveValue(cents.fundamental);
  const strongLock = hasSignal && Math.abs(cents.fundamental as number) <= STRONG_LOCK_CENTS;
  const visibleFundamental = hasSignal ? cents.fundamental : null;
  const visibleOctave = hasSignal ? cents.octave : null;
  const visibleCompoundFifth = hasSignal && compoundFifthEnabled ? cents.compoundFifth : null;
  const bandCount = compoundFifthEnabled ? 3 : 2;

  useEffect(() => {
    if (!hasSignal) return;

    const nextEntry: LiveSample = {
      id: ++feedIdRef.current,
      fundamental: visibleFundamental,
      octave: visibleOctave,
      compoundFifth: visibleCompoundFifth,
    };

    setLiveFeed((current) => {
      const previous = current[0];
      const isTooClose = previous && previous.fundamental !== null && nextEntry.fundamental !== null
        ? Math.abs(previous.fundamental - nextEntry.fundamental) < 0.18
        : false;
      if (isTooClose) return current;
      return [nextEntry, ...current].slice(0, FEED_MAX_ENTRIES);
    });
  }, [hasSignal, visibleFundamental, visibleOctave, visibleCompoundFifth]);

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
              This version keeps the strobes alive while the mic is on, suppresses idle false readings more aggressively, and uses a mobile-friendly horizontal layout when space is tight.
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
          <div className={`maker-strobe-status ${strongLock ? 'strong' : hasSignal ? 'tracking' : ''}`}>
            {statusText(isListening, hasSignal, strongLock, targetLabel)}
          </div>
        </div>

        <div
          className="maker-strobe-visualizer"
          style={{
            marginTop: '22px',
            gridTemplateColumns: compactBands
              ? '1fr'
              : `repeat(${bandCount}, minmax(160px, 1fr))`,
            alignItems: 'stretch',
          }}
        >
          <MakerStrobeBands
            label="Fundamental"
            cents={visibleFundamental}
            active={isListening}
            orientation={compactBands ? 'horizontal' : 'vertical'}
          />
          <MakerStrobeBands
            label="Octave"
            cents={visibleOctave}
            active={isListening}
            orientation={compactBands ? 'horizontal' : 'vertical'}
          />
          {compoundFifthEnabled ? (
            <MakerStrobeBands
              label="Compound fifth"
              cents={visibleCompoundFifth}
              active={isListening}
              orientation={compactBands ? 'horizontal' : 'vertical'}
            />
          ) : null}
        </div>

        <div
          className="maker-strobe-layout"
          style={{
            marginTop: '22px',
            gridTemplateColumns: compactBands ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          }}
        >
          <div className="maker-strobe-live-card">
            <h2>Live cents</h2>
            <div className="maker-live-row">
              <span>Fundamental</span>
              <strong style={{ color: visibleFundamental !== null ? centsToColor(visibleFundamental) : '#93a4bb' }}>
                {visibleFundamental !== null ? formatCents(visibleFundamental) : '—'}
              </strong>
            </div>
            <div className="maker-live-row">
              <span>Octave</span>
              <strong style={{ color: visibleOctave !== null ? centsToColor(visibleOctave) : '#93a4bb' }}>
                {visibleOctave !== null ? formatCents(visibleOctave) : '—'}
              </strong>
            </div>
            <div className="maker-live-row">
              <span>Compound fifth</span>
              <strong style={{ color: visibleCompoundFifth !== null ? centsToColor(visibleCompoundFifth) : '#93a4bb' }}>
                {compoundFifthEnabled
                  ? visibleCompoundFifth !== null
                    ? formatCents(visibleCompoundFifth)
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

        <p className="maker-strobe-footer-note">
          This mode remains separate from the certified strike detector. It is tuned for continuous live response, but now rejects idle noise more aggressively so the page does not sit on fake D3 readings when nothing is being played.
        </p>
      </div>
    </div>
  );
};

export default MakerStrobePage;
