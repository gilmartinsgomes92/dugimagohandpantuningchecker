import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { frequencyToNote } from '../utils/musicUtils';
import { HANDPAN_SCALE_LIBRARY } from '../data/handpanScales';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

// Register a note as soon as the audio lock is good enough (page-local thresholds)
const LOCK_THRESHOLD_REGISTER = IS_IOS ? 0.60 : 0.66;
// UI reaches 100% sooner (display only)
const LOCK_THRESHOLD_DISPLAY = IS_IOS ? 0.52 : 0.58;

const MIN_UNIQUE_NOTES_TO_SUGGEST = 4;

// Small cooldown so a single strike doesn't double-register.
const REGISTRATION_COOLDOWN_MS = 850;

type RegisteredNote = {
  fullName: string;   // e.g. "A3"
  pitchClass: string; // e.g. "A", "Bb", "C#"
  octave: number;
  midi: number;
};

function pitchClassOf(fullName: string): string {
  return fullName.replace(/\d+$/, '');
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function scoreScale(detectedPitchClasses: Set<string>, scalePitchClasses: string[]): { overlap: number; total: number; score: number; missing: string[]; extras: string[] } {
  const scaleSet = new Set(scalePitchClasses);
  let overlap = 0;
  for (const pc of detectedPitchClasses) {
    if (scaleSet.has(pc)) overlap += 1;
  }
  const total = scaleSet.size;
  const missing = scalePitchClasses.filter((pc) => !detectedPitchClasses.has(pc));
  const extras = Array.from(detectedPitchClasses).filter((pc) => !scaleSet.has(pc));

  // Base score is coverage of the scale; lightly penalize extras.
  const base = total === 0 ? 0 : overlap / total;
  const penalty = Math.min(0.35, extras.length * 0.06);
  const score = Math.max(0, base - penalty);

  return { overlap, total, score, missing, extras };
}

const ScaleIdentifyPage: React.FC = () => {
  const navigate = useNavigate();
  const { isListening, result, error, startListening, stopListening, debugInfo } = useAudioProcessor();

  const [registered, setRegistered] = useState<RegisteredNote[]>([]);

  const lastRegisteredAtRef = useRef<number>(0);
  const registeredFullNamesRef = useRef<Set<string>>(new Set());

  // Auto-start listening
  useEffect(() => {
    if (!isListening) startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const displayPct = useMemo(() => {
    const q = result.lockQuality ?? 0;
    return Math.round(Math.min(1, q / LOCK_THRESHOLD_DISPLAY) * 100);
  }, [result.lockQuality]);

  const shouldRegister = useMemo(() => {
    const q = result.lockQuality ?? 0;
    return displayPct >= 98 || q >= LOCK_THRESHOLD_REGISTER;
  }, [displayPct, result.lockQuality]);

  const registerCurrentNote = useCallback(() => {
    if (result.frequency === null) return;

    const now = Date.now();
    if (now - lastRegisteredAtRef.current < REGISTRATION_COOLDOWN_MS) return;
    lastRegisteredAtRef.current = now;

    const note = frequencyToNote(result.frequency);
    const fullName = note.fullName;
    if (registeredFullNamesRef.current.has(fullName)) return;

    registeredFullNamesRef.current.add(fullName);

    const pitchClass = pitchClassOf(fullName);
    const newNote: RegisteredNote = {
      fullName,
      pitchClass,
      octave: note.octave,
      midi: note.midiNote,
    };

    setRegistered((prev) => [...prev, newNote]);
  }, [result.frequency]);

  // Register notes automatically as the user strikes the instrument
  useEffect(() => {
    if (!isListening) return;
    if (!shouldRegister) return;
    if (result.frequency === null) return;

    registerCurrentNote();
  }, [isListening, registerCurrentNote, result.frequency, shouldRegister]);

  const registeredSorted = useMemo(() => {
    return [...registered].sort((a, b) => a.midi - b.midi);
  }, [registered]);

  const detectedPitchClasses = useMemo(() => {
    return new Set(registered.map((n) => n.pitchClass));
  }, [registered]);

  const topMatches = useMemo(() => {
    if (detectedPitchClasses.size < MIN_UNIQUE_NOTES_TO_SUGGEST) return [];

    const rows = HANDPAN_SCALE_LIBRARY.map((s) => {
      const scalePitchClasses = uniq(s.notes.map(pitchClassOf));
      const scored = scoreScale(detectedPitchClasses, scalePitchClasses);
      return {
        sceneName: s.sceneName,
        theoreticalName: s.theoreticalName,
        notes: s.notes,
        scalePitchClasses,
        ...scored,
      };
    }).sort((a, b) => b.score - a.score || b.overlap - a.overlap);

    return rows.slice(0, 3);
  }, [detectedPitchClasses]);

  const best = topMatches[0] ?? null;

  const reset = useCallback(() => {
    registeredFullNamesRef.current = new Set();
    lastRegisteredAtRef.current = 0;
    setRegistered([]);
  }, []);

  const undoLast = useCallback(() => {
    setRegistered((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const removed = copy.pop();
      if (removed) {
        registeredFullNamesRef.current.delete(removed.fullName);
      }
      return copy;
    });
  }, []);

  const goToScaleSelection = useCallback(() => {
    stopListening();
    navigate('/scale-selection');
  }, [navigate, stopListening]);

  return (
    <div className="page scaleid-page">
      <div className="page-header">
        <h1 className="scaleid-title">Identify Your Handpan Scale</h1>
        <p className="scaleid-subtitle">
          Strike your notes in any order. We’ll auto-detect and sort them, then suggest the closest scale.
        </p>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Microphone error:</strong> {String(error)}
        </div>
      )}

      <div className="scaleid-card">
        <div className="scaleid-lockrow">
          <div className="scaleid-locklabel">Lock</div>
          <div className="scaleid-lockbar">
            <div className="scaleid-lockfill" style={{ width: `${displayPct}%` }} />
          </div>
          <div className="scaleid-lockpct">{displayPct}%</div>
        </div>

        <div className="scaleid-live">
          <div className="scaleid-live-note">{result.noteName ?? '—'}</div>
          <div className="scaleid-live-freq">
            {result.frequency ? `${result.frequency.toFixed(2)} Hz` : 'Listening…'}
          </div>
        </div>

        <div className="scaleid-actions">
          <button className="btn btn-secondary" onClick={() => { stopListening(); navigate(-1); }}>
            ← Back
          </button>
          <button className="btn btn-secondary" onClick={undoLast} disabled={registered.length === 0}>
            Undo
          </button>
          <button className="btn btn-secondary" onClick={reset} disabled={registered.length === 0}>
            Reset
          </button>
        </div>
      </div>

      <div className="scaleid-section">
        <h2 className="section-title">Registered notes</h2>
        <div className="scaleid-notes">
          {registeredSorted.length === 0 ? (
            <div className="empty-hint">No notes yet — strike any note on your handpan.</div>
          ) : (
            registeredSorted.map((n) => (
              <span key={n.fullName} className="scaleid-chip">
                {n.fullName}
              </span>
            ))
          )}
        </div>
        <div className="scaleid-hint">
          Tip: start with the <strong>Ding</strong> (center note), then go around the circle.
        </div>
      </div>

      <div className="scaleid-section">
        <h2 className="section-title">Scale match</h2>

        {best === null ? (
          <div className="empty-hint">
            Detect at least {MIN_UNIQUE_NOTES_TO_SUGGEST} different notes to get suggestions.
          </div>
        ) : (
          <div className="scaleid-matchgrid">
            <div className="scaleid-matchcol">
              <div className="scaleid-matchlabel">Handpan Scene Name</div>
              <div className="scaleid-matchvalue">{best.sceneName}</div>
            </div>
            <div className="scaleid-matchcol">
              <div className="scaleid-matchlabel">Theoretical Music Name</div>
              <div className="scaleid-matchvalue">{best.theoreticalName}</div>
            </div>
            <div className="scaleid-matchmeta">
              Confidence: <strong>{Math.round(best.score * 100)}%</strong> · Matched {best.overlap}/{best.total}
              {best.missing.length > 0 ? ` · Missing: ${best.missing.slice(0, 6).join(', ')}${best.missing.length > 6 ? '…' : ''}` : ''}
              {best.extras.length > 0 ? ` · Extras: ${best.extras.slice(0, 6).join(', ')}${best.extras.length > 6 ? '…' : ''}` : ''}
            </div>

            <div className="scaleid-matchactions">
              <button className="btn btn-primary" onClick={goToScaleSelection}>
                Confirm / Select scale
              </button>
              <button className="btn btn-secondary" onClick={goToScaleSelection}>
                View all scales
              </button>
            </div>
          </div>
        )}

        {topMatches.length > 1 && (
          <div className="scaleid-altmatches">
            <div className="scaleid-alt-title">Other possible matches</div>
            {topMatches.slice(1).map((m) => (
              <div key={m.theoreticalName} className="scaleid-altrow">
                <span className="scaleid-altname">{m.sceneName} | {m.theoreticalName}</span>
                <span className="scaleid-altscore">{Math.round(m.score * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {DEBUG && (
        <div className="debug-panel">
          <h3>Debug</h3>
          <pre>{JSON.stringify({ result, debugInfo, registered: registeredSorted }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default ScaleIdentifyPage;
