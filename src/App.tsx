/**
 * Handpan Pro Strobe Tuner
 *
 * A professional-grade strobe tuner for handpan instruments.
 * Provides real-time detection of:
 *   - Fundamental frequency (with nearest note name and cents deviation)
 *   - Octave (2x fundamental, should be exactly 0 cents from 2:1 ratio)
 *   - Compound fifth (3x fundamental / P12, should be exactly 0 cents from 3:1 ratio)
 *
 * Each harmonic has its own independent strobe disk and cents gauge.
 */

import { useAudioProcessor } from './hooks/useAudioProcessor';
import { StrobeDisk } from './components/StrobeDisk';
import { CentsGauge } from './components/CentsGauge';
import { formatCents, centsToColor } from './utils/musicUtils';
import './App.css';

function App() {
  const { tunerData, isRunning, error, start, stop } = useAudioProcessor();

  const fd = tunerData?.fundamental;
  const oct = tunerData?.octave;
  const cf = tunerData?.compoundFifth;

  // Reference frequencies for strobe disks
  const fundamentalRef = fd?.targetFrequency ?? null;
  const octaveRef = fd?.frequency ? fd.frequency * 2 : null;
  const compoundFifthRef = fd?.frequency ? fd.frequency * 3 : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">
          <span className="title-icon">&#9672;</span>
          Handpan Tuner
        </h1>
        <p className="app-subtitle">Pro Strobe Tuner &mdash; Fundamental &middot; Octave &middot; Compound Fifth</p>
      </header>

      {/* Note display */}
      <div className="note-display">
        {isRunning && tunerData?.hasSignal && fd?.noteName ? (
          <>
            <span className="note-name">{fd.noteName}</span>
            {fd.frequency && (
              <span className="note-frequency">{fd.frequency.toFixed(2)} Hz</span>
            )}
          </>
        ) : (
          <span className="note-placeholder">
            {isRunning ? (tunerData?.hasSignal === false ? 'Listening\u2026' : '\u2014') : '\u2014'}
          </span>
        )}
      </div>

      {/* Strobe disks row */}
      <div className="strobe-row">
        {/* Fundamental */}
        <div className="strobe-panel">
          <StrobeDisk
            label="Fundamental"
            detectedFreq={fd?.frequency ?? null}
            referenceFreq={fundamentalRef}
            active={isRunning && (fd?.frequency ?? null) !== null}
            color="#00d4ff"
            numSegments={12}
            size={190}
          />
          <div className="harmonic-info">
            <span
              className="cents-value"
              style={{ color: fd?.cents != null ? centsToColor(fd.cents) : '#555' }}
            >
              {fd?.cents != null ? formatCents(fd.cents) : '\u2014'}
            </span>
            <span className="harmonic-subtitle">from {fd?.noteName ?? '\u2014'}</span>
          </div>
          <CentsGauge cents={fd?.cents ?? null} maxCents={50} />
        </div>

        {/* Octave */}
        <div className="strobe-panel">
          <StrobeDisk
            label="Octave (2x)"
            detectedFreq={oct?.frequency ?? null}
            referenceFreq={octaveRef}
            active={isRunning && (oct?.frequency ?? null) !== null}
            color="#ff9900"
            numSegments={12}
            size={190}
          />
          <div className="harmonic-info">
            <span
              className="cents-value"
              style={{ color: oct?.cents != null ? centsToColor(oct.cents) : '#555' }}
            >
              {oct?.cents != null ? formatCents(oct.cents) : '\u2014'}
            </span>
            <span className="harmonic-subtitle">from ideal 2:1 ratio</span>
          </div>
          <CentsGauge cents={oct?.cents ?? null} maxCents={50} />
        </div>

        {/* Compound Fifth */}
        <div className="strobe-panel">
          <StrobeDisk
            label="Comp. Fifth (3x)"
            detectedFreq={cf?.frequency ?? null}
            referenceFreq={compoundFifthRef}
            active={isRunning && (cf?.frequency ?? null) !== null}
            color="#cc44ff"
            numSegments={12}
            size={190}
          />
          <div className="harmonic-info">
            <span
              className="cents-value"
              style={{ color: cf?.cents != null ? centsToColor(cf.cents) : '#555' }}
            >
              {cf?.cents != null ? formatCents(cf.cents) : '\u2014'}
            </span>
            <span className="harmonic-subtitle">from ideal 3:1 ratio</span>
          </div>
          <CentsGauge cents={cf?.cents ?? null} maxCents={50} />
        </div>
      </div>

      {/* Status bar */}
      <div className="status-bar">
        {isRunning && tunerData?.hasSignal && (
          <>
            {oct?.frequency && (
              <span className="status-item">
                Octave: <strong>{oct.frequency.toFixed(2)} Hz</strong>
              </span>
            )}
            {cf?.frequency && (
              <span className="status-item">
                Comp. Fifth: <strong>{cf.frequency.toFixed(2)} Hz</strong>
              </span>
            )}
          </>
        )}
      </div>

      {/* Tuning legend */}
      {isRunning && tunerData?.hasSignal && (
        <div className="tune-legend">
          <span className="legend-item legend-perfect">&#9679; &#177;0&ndash;2&#162; Perfect</span>
          <span className="legend-item legend-good">&#9679; &#177;2&ndash;5&#162; Very Good</span>
          <span className="legend-item legend-ok">&#9679; &#177;5&ndash;10&#162; Acceptable</span>
          <span className="legend-item legend-bad">&#9679; &gt;10&#162; Needs Tuning</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-banner" role="alert">
          &#9888; {error}
        </div>
      )}

      {/* Start / Stop button */}
      <div className="controls">
        <button
          className={"start-btn" + (isRunning ? " running" : "")}
          onClick={isRunning ? stop : start}
          aria-label={isRunning ? 'Stop tuner' : 'Start tuner'}
        >
          {isRunning ? (
            <>
              <span className="btn-icon">&#9209;</span> Stop
            </>
          ) : (
            <>
              <span className="btn-icon">&#9654;</span> Start Tuner
            </>
          )}
        </button>
      </div>

      {/* Info footer */}
      <footer className="app-footer">
        <p>
          Strobe stationary = in tune &middot; Clockwise = sharp &middot; Counter-clockwise = flat
        </p>
        <p className="accuracy-note">
          Accuracy: sub-cent (YIN algorithm + FFT parabolic interpolation)
        </p>
      </footer>
    </div>
  );
}

export default App;
