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

const makerStrobeStyles = `
.maker-strobe-v3 {
  min-height: 100vh;
  padding: 88px 18px 36px;
  background:
    radial-gradient(circle at top, rgba(66, 117, 198, 0.24), transparent 34%),
    radial-gradient(circle at bottom left, rgba(0, 214, 255, 0.14), transparent 28%),
    linear-gradient(180deg, #07111f 0%, #050b15 100%);
}

.maker-strobe-v3__shell {
  width: min(1220px, 100%);
  margin: 0 auto;
  padding: 24px;
  border-radius: 28px;
  border: 1px solid rgba(140, 177, 228, 0.18);
  background: rgba(9, 17, 31, 0.9);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.32);
}

.maker-strobe-v3__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.maker-strobe-v3__eyebrow {
  margin: 0 0 6px;
  color: #67c7ff;
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
}

.maker-strobe-v3__title {
  margin: 0;
  font-size: clamp(1.85rem, 4vw, 2.7rem);
  line-height: 1.06;
}

.maker-strobe-v3__subtitle {
  max-width: 760px;
  margin: 10px 0 0;
  color: #a7b8cf;
  line-height: 1.55;
}

.maker-strobe-v3__back {
  color: #c9d6ea;
  text-decoration: none;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(140, 177, 228, 0.22);
  background: rgba(17, 29, 48, 0.78);
  white-space: nowrap;
}

.maker-strobe-v3__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}

.maker-strobe-v3__control,
.maker-strobe-v3__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(140, 177, 228, 0.18);
  background: rgba(13, 24, 41, 0.92);
}

.maker-strobe-v3__control span,
.maker-strobe-v3__toggle span {
  color: #c9d6ea;
  font-size: 0.95rem;
}

.maker-strobe-v3__control select {
  min-width: 126px;
  border: 1px solid rgba(140, 177, 228, 0.22);
  background: #08111e;
  color: #f5f8ff;
  border-radius: 12px;
  padding: 10px 12px;
}

.maker-strobe-v3__toggle input {
  accent-color: #49b6ff;
}

.maker-strobe-v3__target {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.9fr) auto;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px solid rgba(140, 177, 228, 0.18);
  background: linear-gradient(180deg, rgba(15, 28, 47, 0.96) 0%, rgba(10, 18, 31, 0.96) 100%);
}

.maker-strobe-v3__target-label {
  color: #8ca0bc;
  font-size: 0.88rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.maker-strobe-v3__target-note {
  margin-top: 6px;
  font-size: clamp(2.1rem, 6vw, 3.8rem);
  font-weight: 700;
  line-height: 1;
}

.maker-strobe-v3__meta {
  display: grid;
  gap: 6px;
  color: #d6e4f6;
  font-size: 0.98rem;
}

.maker-strobe-v3__status {
  min-width: 180px;
  text-align: center;
  padding: 12px 16px;
  border-radius: 999px;
  color: #cad7eb;
  background: rgba(18, 31, 52, 0.9);
  border: 1px solid rgba(140, 177, 228, 0.16);
}

.maker-strobe-v3__status.is-tracking { color: #ffe39a; }
.maker-strobe-v3__status.is-locked { color: #9df4c6; }

.maker-strobe-v3__content {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.92fr);
  gap: 22px;
  margin-top: 22px;
  align-items: start;
}

.maker-strobe-v3__visual-card,
.maker-strobe-v3__card {
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(140, 177, 228, 0.16);
  background: linear-gradient(180deg, rgba(11, 22, 38, 0.96) 0%, rgba(8, 15, 27, 0.96) 100%);
}

.maker-strobe-v3__visual-card {
  display: grid;
  gap: 14px;
}

.maker-strobe-v3__visual-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}

.maker-strobe-v3__visual-title,
.maker-strobe-v3__card h2 {
  margin: 0;
  font-size: 1.05rem;
}

.maker-strobe-v3__visual-hint,
.maker-strobe-v3__hint,
.maker-strobe-v3__footer,
.maker-strobe-v3__feed-empty {
  color: #8fa5c2;
  line-height: 1.55;
}

.maker-strobe-v3__band-stack {
  display: grid;
  gap: 12px;
}

.maker-lane-band {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(140, 177, 228, 0.14);
  background: linear-gradient(180deg, rgba(10, 19, 33, 0.96) 0%, rgba(7, 14, 24, 0.96) 100%);
}

.maker-lane-band__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.maker-lane-band__label {
  color: #e7f0fb;
  font-weight: 600;
  font-size: 0.98rem;
}

.maker-lane-band__sub {
  margin-top: 4px;
  color: #8fa5c2;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.maker-lane-band__value {
  padding: 7px 12px;
  min-width: 96px;
  text-align: center;
  border-radius: 999px;
  border: 1px solid rgba(122, 146, 178, 0.16);
  background: rgba(11, 19, 33, 0.88);
  font-variant-numeric: tabular-nums;
  font-size: 0.94rem;
  font-weight: 600;
}

.maker-lane-band__lane {
  position: relative;
  width: 100%;
  height: clamp(84px, 12vw, 108px);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(109, 140, 184, 0.18);
}

.maker-lane-band__film-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.maker-lane-band__film {
  position: absolute;
  top: -30%;
  left: 0;
  width: calc(100% + 96px);
  height: 160%;
  background-size: 96px 100%;
  will-change: transform;
  filter: saturate(1.08);
}

.maker-lane-band__guide {
  position: absolute;
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(232, 240, 250, 0.95) 18%, rgba(232, 240, 250, 0.95) 82%, rgba(255,255,255,0) 100%);
  opacity: 0.72;
}

.maker-lane-band__glow,
.maker-lane-band__shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.maker-lane-band__shade {
  background:
    linear-gradient(90deg, rgba(5,11,20,0.96) 0%, rgba(5,11,20,0.12) 18%, rgba(5,11,20,0.04) 50%, rgba(5,11,20,0.12) 82%, rgba(5,11,20,0.96) 100%),
    linear-gradient(180deg, rgba(5,11,20,0.66) 0%, rgba(5,11,20,0.08) 24%, rgba(5,11,20,0.08) 76%, rgba(5,11,20,0.66) 100%);
}

.maker-strobe-v3__sidebar {
  display: grid;
  gap: 18px;
}

.maker-strobe-v3__rows {
  display: grid;
  gap: 4px;
}

.maker-strobe-v3__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(140, 177, 228, 0.1);
}

.maker-strobe-v3__row:last-of-type { border-bottom: 0; }
.maker-strobe-v3__row span { color: #a6b7cf; }
.maker-strobe-v3__row strong { font-size: 1.15rem; }

.maker-strobe-v3__feed-head,
.maker-strobe-v3__feed-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
}

.maker-strobe-v3__feed-head {
  color: #8fa5c2;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 2px 10px;
}

.maker-strobe-v3__feed-list {
  display: grid;
  gap: 10px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}

.maker-strobe-v3__feed-row {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(14, 23, 39, 0.9);
  color: #dce8f8;
  font-variant-numeric: tabular-nums;
}

.maker-strobe-v3__footer {
  margin-top: 18px;
}

@media (max-width: 980px) {
  .maker-strobe-v3__header,
  .maker-strobe-v3__target,
  .maker-strobe-v3__content {
    grid-template-columns: 1fr;
    display: grid;
  }

  .maker-strobe-v3__header {
    gap: 14px;
  }
}

@media (max-width: 720px) {
  .maker-strobe-v3 {
    padding-inline: 12px;
  }

  .maker-strobe-v3__shell {
    padding: 18px;
    border-radius: 22px;
  }

  .maker-strobe-v3__controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .maker-strobe-v3__control,
  .maker-strobe-v3__toggle {
    justify-content: space-between;
  }

  .maker-strobe-v3__control select {
    min-width: 110px;
  }

  .maker-strobe-v3__visual-head,
  .maker-lane-band__header {
    grid-template-columns: 1fr;
    display: grid;
  }

  .maker-lane-band__value {
    justify-self: start;
  }

  .maker-lane-band__lane {
    height: 88px;
  }

  .maker-strobe-v3__feed-head,
  .maker-strobe-v3__feed-row {
    grid-template-columns: repeat(3, minmax(68px, 1fr));
    font-size: 0.92rem;
  }
}
`;

function midiFromSelection(semitone: number, octave: number): number {
  return (octave + 1) * 12 + semitone;
}

function hasLiveValue(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

function statusText(isListening: boolean, hasSignal: boolean, strongLock: boolean, targetLabel: string): string {
  if (!isListening) return 'Starting microphone…';
  if (strongLock) return `${targetLabel} nearly centered`;
  if (hasSignal) return `Tracking ${targetLabel}`;
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
  const statusClass = strongLock ? 'is-locked' : withinGate ? 'is-tracking' : '';

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
    <div className="page maker-strobe-v3">
      <style>{makerStrobeStyles}</style>

      <div className="maker-strobe-v3__shell">
        <div className="maker-strobe-v3__header">
          <div>
            <p className="maker-strobe-v3__eyebrow">Maker mode</p>
            <h1 className="maker-strobe-v3__title">Target-locked strobe tuner</h1>
            <p className="maker-strobe-v3__subtitle">
              The listening path stays untouched. This version only reworks the strobe display and page layout so the bands fit phone and desktop screens more naturally.
            </p>
          </div>

          <Link className="maker-strobe-v3__back" to="/">
            ← Back to home
          </Link>
        </div>

        <div className="maker-strobe-v3__controls">
          <label className="maker-strobe-v3__control">
            <span>Pitch class</span>
            <select value={pitchClass} onChange={(event) => setPitchClass(event.target.value)}>
              {NOTE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-strobe-v3__control">
            <span>Octave</span>
            <select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>
              {OCTAVE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-strobe-v3__toggle">
            <input
              type="checkbox"
              checked={compoundFifthEnabled}
              onChange={(event) => setShowCompoundFifth(event.target.checked)}
              disabled={isOctaveOnlyDefault}
            />
            <span>Show compound fifth band</span>
          </label>
        </div>

        <section className="maker-strobe-v3__target">
          <div>
            <div className="maker-strobe-v3__target-label">Selected target</div>
            <div className="maker-strobe-v3__target-note">{targetLabel}</div>
          </div>

          <div className="maker-strobe-v3__meta">
            <div>F0 {targetFundamental.toFixed(2)} Hz</div>
            <div>8ve {targetOctave.toFixed(2)} Hz</div>
            <div>{compoundFifthEnabled ? `12th ${targetCompoundFifth.toFixed(2)} Hz` : '12th hidden'}</div>
          </div>

          <div className={`maker-strobe-v3__status ${statusClass}`}>
            {statusText(isListening, hasSignal, strongLock, targetLabel)}
          </div>
        </section>

        <div className="maker-strobe-v3__content">
          <section className="maker-strobe-v3__visual-card">
            <div className="maker-strobe-v3__visual-head">
              <h2 className="maker-strobe-v3__visual-title">Live strobes</h2>
              <div className="maker-strobe-v3__visual-hint">
                Horizontal lanes keep all three partials visible on phone and desktop.
              </div>
            </div>

            <div className="maker-strobe-v3__band-stack">
              <MakerStrobeBands label="Fundamental" cents={cents.fundamental} active={isListening} />
              <MakerStrobeBands label="Octave" cents={cents.octave} active={isListening} />
              <MakerStrobeBands
                label="Compound fifth"
                cents={compoundFifthEnabled ? cents.compoundFifth : null}
                active={isListening}
              />
            </div>
          </section>

          <div className="maker-strobe-v3__sidebar">
            <section className="maker-strobe-v3__card">
              <h2>Live cents</h2>
              <div className="maker-strobe-v3__rows">
                <div className="maker-strobe-v3__row">
                  <span>Fundamental</span>
                  <strong style={{ color: cents.fundamental !== null ? centsToColor(cents.fundamental) : '#93a4bb' }}>
                    {cents.fundamental !== null ? formatCents(cents.fundamental) : '—'}
                  </strong>
                </div>

                <div className="maker-strobe-v3__row">
                  <span>Octave</span>
                  <strong style={{ color: cents.octave !== null ? centsToColor(cents.octave) : '#93a4bb' }}>
                    {cents.octave !== null ? formatCents(cents.octave) : '—'}
                  </strong>
                </div>

                <div className="maker-strobe-v3__row">
                  <span>Compound fifth</span>
                  <strong style={{ color: cents.compoundFifth !== null ? centsToColor(cents.compoundFifth) : '#93a4bb' }}>
                    {compoundFifthEnabled
                      ? cents.compoundFifth !== null
                        ? formatCents(cents.compoundFifth)
                        : '—'
                      : 'N/A'}
                  </strong>
                </div>
              </div>

              <div className="maker-strobe-v3__hint">
                Confidence {(confidence * 100).toFixed(0)}% · RMS {amplitude.toFixed(4)}
              </div>
              {error ? <div className="maker-strobe-v3__hint" style={{ color: '#ffb1b1', marginTop: 10 }}>{error}</div> : null}
            </section>

            <section className="maker-strobe-v3__card">
              <h2>Live deviation feed</h2>
              <div className="maker-strobe-v3__feed-head">
                <span>F0</span>
                <span>8ve</span>
                <span>12th</span>
              </div>

              <div className="maker-strobe-v3__feed-list">
                {liveFeed.length === 0 ? (
                  <p className="maker-strobe-v3__feed-empty">Play {targetLabel} to start the live cents feed.</p>
                ) : (
                  liveFeed.map((sample) => (
                    <div key={sample.id} className="maker-strobe-v3__feed-row">
                      <span>{sample.fundamental !== null ? formatCents(sample.fundamental) : '—'}</span>
                      <span>{sample.octave !== null ? formatCents(sample.octave) : '—'}</span>
                      <span>{compoundFifthEnabled ? (sample.compoundFifth !== null ? formatCents(sample.compoundFifth) : '—') : 'N/A'}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <p className="maker-strobe-v3__footer">
          This page keeps the current live listening behavior and only changes the visual interpretation of that stream.
        </p>
      </div>
    </div>
  );
};

export default MakerStrobePage;
