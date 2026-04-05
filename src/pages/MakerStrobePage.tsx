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
.page.maker-cockpit-page {
  display: block;
  width: 100%;
  max-width: none;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  gap: 0;
  color: #dce7f6;
  background:
    radial-gradient(circle at top, rgba(66, 117, 198, 0.24), transparent 34%),
    radial-gradient(circle at bottom left, rgba(0, 214, 255, 0.12), transparent 28%),
    linear-gradient(180deg, #07111f 0%, #050b15 100%);
}

.maker-cockpit {
  width: min(1380px, calc(100vw - 28px));
  margin: 0 auto;
  padding: 82px 0 34px;
}

.maker-cockpit__shell {
  border-radius: 28px;
  border: 1px solid rgba(140, 177, 228, 0.16);
  background: rgba(8, 16, 29, 0.92);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.34);
  overflow: hidden;
}

.maker-cockpit__header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  padding: 22px 24px 16px;
  border-bottom: 1px solid rgba(140, 177, 228, 0.1);
}

.maker-cockpit__eyebrow {
  margin: 0 0 8px;
  color: #6bc9ff;
  font-size: 0.8rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.maker-cockpit__title {
  margin: 0;
  font-size: clamp(1.7rem, 3.6vw, 2.5rem);
  line-height: 1.06;
}

.maker-cockpit__subtitle {
  max-width: 820px;
  margin: 10px 0 0;
  color: #9fb1ca;
  line-height: 1.55;
}

.maker-cockpit__back {
  color: #d7e2f0;
  text-decoration: none;
  border: 1px solid rgba(140, 177, 228, 0.18);
  background: rgba(14, 23, 39, 0.9);
  padding: 10px 14px;
  border-radius: 999px;
  white-space: nowrap;
}

.maker-cockpit__toolbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, auto)) minmax(0, 1fr);
  gap: 12px;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(140, 177, 228, 0.08);
  background: rgba(9, 17, 31, 0.7);
}

.maker-cockpit__control,
.maker-cockpit__toggle,
.maker-cockpit__badge {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(140, 177, 228, 0.14);
  background: rgba(12, 22, 38, 0.92);
}

.maker-cockpit__control span,
.maker-cockpit__toggle span,
.maker-cockpit__badge-label {
  color: #c9d7ea;
  font-size: 0.92rem;
}

.maker-cockpit__control select {
  min-width: 118px;
  border-radius: 12px;
  border: 1px solid rgba(140, 177, 228, 0.16);
  background: #07111f;
  color: #f5f8ff;
  padding: 10px 12px;
}

.maker-cockpit__toggle input {
  accent-color: #49b6ff;
}

.maker-cockpit__badge {
  justify-content: space-between;
}

.maker-cockpit__badge-value {
  color: #f2f7ff;
  font-weight: 600;
}

.maker-cockpit__stage {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.95fr);
  gap: 18px;
  padding: 18px;
}

.maker-cockpit__panel {
  border: 1px solid rgba(140, 177, 228, 0.14);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(10, 20, 35, 0.98) 0%, rgba(6, 13, 24, 0.98) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}

.maker-cockpit__panel--strobes {
  padding: 16px;
}

.maker-cockpit__panel--telemetry {
  padding: 16px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
}

.maker-cockpit__panel-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  margin-bottom: 12px;
}

.maker-cockpit__panel-title {
  margin: 0;
  font-size: 1.04rem;
}

.maker-cockpit__panel-hint,
.maker-cockpit__footer,
.maker-cockpit__feed-empty,
.maker-cockpit__meta-small {
  color: #8ea3c0;
  line-height: 1.5;
}

.maker-cockpit__target-strip {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) repeat(3, minmax(120px, 0.65fr));
  gap: 12px;
  margin-bottom: 14px;
}

.maker-cockpit__target-card,
.maker-cockpit__mini-card {
  border-radius: 18px;
  border: 1px solid rgba(140, 177, 228, 0.14);
  background: rgba(12, 22, 38, 0.9);
}

.maker-cockpit__target-card {
  padding: 16px 18px;
}

.maker-cockpit__target-label,
.maker-cockpit__mini-label,
.maker-cockpit__feed-head {
  color: #8da3bf;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.76rem;
}

.maker-cockpit__target-note {
  margin-top: 6px;
  font-size: clamp(2rem, 6vw, 3.5rem);
  line-height: 1;
  font-weight: 700;
}

.maker-cockpit__target-meta {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  color: #d8e4f4;
  font-size: 0.96rem;
}

.maker-cockpit__mini-card {
  padding: 14px;
  display: grid;
  gap: 6px;
  align-content: center;
}

.maker-cockpit__mini-value {
  font-size: 1.28rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.maker-cockpit__band-stack {
  display: grid;
  gap: 12px;
}

.maker-cockpit-band {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(140, 177, 228, 0.12);
  background: linear-gradient(180deg, rgba(9, 18, 32, 0.96) 0%, rgba(6, 13, 24, 0.96) 100%);
}

.maker-cockpit-band__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.maker-cockpit-band__label {
  color: #ebf3ff;
  font-size: 0.98rem;
  font-weight: 600;
}

.maker-cockpit-band__sub {
  margin-top: 4px;
  color: #8da3bf;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.maker-cockpit-band__value {
  min-width: 94px;
  text-align: center;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(126, 151, 188, 0.16);
  background: rgba(10, 18, 31, 0.88);
  font-variant-numeric: tabular-nums;
  font-size: 0.94rem;
  font-weight: 600;
}

.maker-cockpit-band__lane {
  position: relative;
  height: clamp(74px, 9vw, 98px);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(109, 140, 184, 0.18);
}

.maker-cockpit-band__film-frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.maker-cockpit-band__film {
  position: absolute;
  top: -30%;
  left: 0;
  width: calc(100% + 96px);
  height: 160%;
  background-size: 96px 100%;
  will-change: transform;
}

.maker-cockpit-band__guide {
  position: absolute;
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(235, 242, 251, 0.96) 18%, rgba(235, 242, 251, 0.96) 82%, rgba(255,255,255,0) 100%);
  opacity: 0.74;
}

.maker-cockpit-band__glow,
.maker-cockpit-band__shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.maker-cockpit-band__shade {
  background:
    linear-gradient(90deg, rgba(5,11,20,0.96) 0%, rgba(5,11,20,0.12) 18%, rgba(5,11,20,0.04) 50%, rgba(5,11,20,0.12) 82%, rgba(5,11,20,0.96) 100%),
    linear-gradient(180deg, rgba(5,11,20,0.66) 0%, rgba(5,11,20,0.08) 24%, rgba(5,11,20,0.08) 76%, rgba(5,11,20,0.66) 100%);
}

.maker-cockpit__telemetry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.maker-cockpit__metric-card {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(140, 177, 228, 0.12);
  background: rgba(11, 20, 34, 0.9);
  display: grid;
  gap: 6px;
}

.maker-cockpit__metric-label {
  color: #8ea3c0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.maker-cockpit__metric-value {
  font-size: 1.32rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.maker-cockpit__metric-sub {
  color: #8ea3c0;
  font-size: 0.84rem;
}

.maker-cockpit__feed-card {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(140, 177, 228, 0.12);
  background: rgba(11, 20, 34, 0.9);
  display: grid;
  gap: 12px;
  min-height: 0;
}

.maker-cockpit__feed-head,
.maker-cockpit__feed-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
}

.maker-cockpit__feed-list {
  display: grid;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
  padding-right: 2px;
}

.maker-cockpit__feed-row {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(15, 25, 42, 0.9);
  color: #dce8f8;
  font-variant-numeric: tabular-nums;
}

.maker-cockpit__footer {
  padding: 0 24px 22px;
}

@media (max-width: 1120px) {
  .maker-cockpit__toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .maker-cockpit__stage,
  .maker-cockpit__target-strip {
    grid-template-columns: 1fr;
  }

  .maker-cockpit__telemetry-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .maker-cockpit {
    width: min(100vw - 14px, 100%);
    padding-top: 72px;
  }

  .maker-cockpit__header {
    display: grid;
  }

  .maker-cockpit__toolbar {
    grid-template-columns: 1fr;
  }

  .maker-cockpit__telemetry-grid {
    grid-template-columns: 1fr;
  }

  .maker-cockpit__feed-head,
  .maker-cockpit__feed-row {
    grid-template-columns: repeat(3, minmax(68px, 1fr));
    font-size: 0.92rem;
  }
}

@media (max-width: 640px) {
  .maker-cockpit__header,
  .maker-cockpit__toolbar,
  .maker-cockpit__stage,
  .maker-cockpit__footer {
    padding-left: 14px;
    padding-right: 14px;
  }

  .maker-cockpit__header {
    padding-top: 18px;
  }

  .maker-cockpit__stage {
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .maker-cockpit__target-card,
  .maker-cockpit__mini-card,
  .maker-cockpit__panel--strobes,
  .maker-cockpit__panel--telemetry {
    padding: 14px;
  }

  .maker-cockpit-band__header {
    display: grid;
    grid-template-columns: 1fr;
  }

  .maker-cockpit-band__value {
    justify-self: start;
  }

  .maker-cockpit-band__lane {
    height: 78px;
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

function formatOrDash(value: number | null): string {
  return value !== null ? formatCents(value) : '—';
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
  const status = statusText(isListening, hasSignal, strongLock, targetLabel);

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
    <div className="page maker-cockpit-page">
      <style>{makerStrobeStyles}</style>

      <div className="maker-cockpit">
        <div className="maker-cockpit__shell">
          <header className="maker-cockpit__header">
            <div>
              <p className="maker-cockpit__eyebrow">Maker mode</p>
              <h1 className="maker-cockpit__title">Tuning cockpit</h1>
              <p className="maker-cockpit__subtitle">
                Compact target-locked layout with the strobes, live cents, and rolling deviation feed inside one cockpit.
                This patch only changes the visual layout and does not touch the current listening path.
              </p>
            </div>

            <Link className="maker-cockpit__back" to="/">
              ← Back to home
            </Link>
          </header>

          <section className="maker-cockpit__toolbar">
            <label className="maker-cockpit__control">
              <span>Pitch class</span>
              <select value={pitchClass} onChange={(event) => setPitchClass(event.target.value)}>
                {NOTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="maker-cockpit__control">
              <span>Octave</span>
              <select value={octave} onChange={(event) => setOctave(Number(event.target.value))}>
                {OCTAVE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="maker-cockpit__toggle">
              <input
                type="checkbox"
                checked={compoundFifthEnabled}
                onChange={(event) => setShowCompoundFifth(event.target.checked)}
                disabled={isOctaveOnlyDefault}
              />
              <span>Show compound fifth</span>
            </label>

            <div className="maker-cockpit__badge">
              <span className="maker-cockpit__badge-label">Status</span>
              <span className="maker-cockpit__badge-value">{status}</span>
            </div>
          </section>

          <section className="maker-cockpit__stage">
            <div className="maker-cockpit__panel maker-cockpit__panel--strobes">
              <div className="maker-cockpit__target-strip">
                <div className="maker-cockpit__target-card">
                  <div className="maker-cockpit__target-label">Selected target</div>
                  <div className="maker-cockpit__target-note">{targetLabel}</div>
                  <div className="maker-cockpit__target-meta">
                    <div>F0 {targetFundamental.toFixed(2)} Hz</div>
                    <div>8ve {targetOctave.toFixed(2)} Hz</div>
                    <div>{compoundFifthEnabled ? `12th ${targetCompoundFifth.toFixed(2)} Hz` : '12th hidden'}</div>
                  </div>
                </div>

                <div className="maker-cockpit__mini-card">
                  <div className="maker-cockpit__mini-label">Confidence</div>
                  <div className="maker-cockpit__mini-value">{(confidence * 100).toFixed(0)}%</div>
                  <div className="maker-cockpit__meta-small">Signal confidence</div>
                </div>

                <div className="maker-cockpit__mini-card">
                  <div className="maker-cockpit__mini-label">RMS</div>
                  <div className="maker-cockpit__mini-value">{amplitude.toFixed(4)}</div>
                  <div className="maker-cockpit__meta-small">Input level</div>
                </div>

                <div className="maker-cockpit__mini-card">
                  <div className="maker-cockpit__mini-label">Lock</div>
                  <div className="maker-cockpit__mini-value">{strongLock ? 'Strong' : withinGate ? 'Tracking' : 'Wide'}</div>
                  <div className="maker-cockpit__meta-small">Fundamental gate</div>
                </div>
              </div>

              <div className="maker-cockpit__panel-head">
                <h2 className="maker-cockpit__panel-title">Live strobes</h2>
                <div className="maker-cockpit__panel-hint">Three compact lanes for phone and desktop.</div>
              </div>

              <div className="maker-cockpit__band-stack">
                <MakerStrobeBands label="Fundamental" cents={cents.fundamental} active={isListening} />
                <MakerStrobeBands label="Octave" cents={cents.octave} active={isListening} />
                <MakerStrobeBands
                  label="Compound fifth"
                  cents={compoundFifthEnabled ? cents.compoundFifth : null}
                  active={compoundFifthEnabled ? isListening : false}
                  subLabel={compoundFifthEnabled ? undefined : 'Hidden'}
                />
              </div>
            </div>

            <div className="maker-cockpit__panel maker-cockpit__panel--telemetry">
              <div>
                <div className="maker-cockpit__panel-head">
                  <h2 className="maker-cockpit__panel-title">Live cents</h2>
                  <div className="maker-cockpit__panel-hint">Fast readout beside the strobes.</div>
                </div>

                <div className="maker-cockpit__telemetry-grid">
                  <div className="maker-cockpit__metric-card">
                    <div className="maker-cockpit__metric-label">Fundamental</div>
                    <div className="maker-cockpit__metric-value" style={{ color: cents.fundamental !== null ? centsToColor(cents.fundamental) : '#93a4bb' }}>
                      {formatOrDash(cents.fundamental)}
                    </div>
                    <div className="maker-cockpit__metric-sub">Primary target</div>
                  </div>

                  <div className="maker-cockpit__metric-card">
                    <div className="maker-cockpit__metric-label">Octave</div>
                    <div className="maker-cockpit__metric-value" style={{ color: cents.octave !== null ? centsToColor(cents.octave) : '#93a4bb' }}>
                      {formatOrDash(cents.octave)}
                    </div>
                    <div className="maker-cockpit__metric-sub">2× partial</div>
                  </div>

                  <div className="maker-cockpit__metric-card">
                    <div className="maker-cockpit__metric-label">Compound fifth</div>
                    <div className="maker-cockpit__metric-value" style={{ color: cents.compoundFifth !== null ? centsToColor(cents.compoundFifth) : '#93a4bb' }}>
                      {compoundFifthEnabled ? formatOrDash(cents.compoundFifth) : 'N/A'}
                    </div>
                    <div className="maker-cockpit__metric-sub">3× partial</div>
                  </div>
                </div>
              </div>

              <div className="maker-cockpit__feed-card">
                <div className="maker-cockpit__panel-head" style={{ marginBottom: 0 }}>
                  <h2 className="maker-cockpit__panel-title">Deviation feed</h2>
                  <div className="maker-cockpit__panel-hint">Latest valid live samples.</div>
                </div>

                <div className="maker-cockpit__feed-head">
                  <span>F0</span>
                  <span>8ve</span>
                  <span>12th</span>
                </div>

                <div className="maker-cockpit__feed-list">
                  {liveFeed.length === 0 ? (
                    <p className="maker-cockpit__feed-empty">Play {targetLabel} to start the live cents feed.</p>
                  ) : (
                    liveFeed.map((sample) => (
                      <div key={sample.id} className="maker-cockpit__feed-row">
                        <span>{sample.fundamental !== null ? formatCents(sample.fundamental) : '—'}</span>
                        <span>{sample.octave !== null ? formatCents(sample.octave) : '—'}</span>
                        <span>{compoundFifthEnabled ? (sample.compoundFifth !== null ? formatCents(sample.compoundFifth) : '—') : 'N/A'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {error ? <div className="maker-cockpit__meta-small" style={{ color: '#ffb1b1' }}>{error}</div> : null}
            </div>
          </section>

          <p className="maker-cockpit__footer">
            This cockpit keeps the current listening behavior. The Mac idle flicker is a separate detector-side issue, so this patch only fixes the layout and visual organization.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MakerStrobePage;
