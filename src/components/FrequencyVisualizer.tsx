/**
 * FrequencyVisualizer – real-time FFT spectrum display.
 *
 * Renders the dB magnitude spectrum from the AnalyserNode as a bar chart,
 * with fundamental, octave, and fifth peaks highlighted in distinct colors.
 */

import { useRef, useEffect } from 'react';

interface FrequencyVisualizerProps {
  /** Float32Array of dB magnitudes (length = fftSize / 2). Pass null when not recording. */
  spectrum: Float32Array | null;
  /** Fundamental frequency in Hz (used to highlight peaks). */
  fundamentalFreq: number | null;
  /** Sample rate in Hz (default 44100). */
  sampleRate?: number;
  /** FFT size used (default 4096). */
  fftSize?: number;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 160;
const MIN_DB = -100;
const MAX_DB = -20;

export function FrequencyVisualizer({
  spectrum,
  fundamentalFreq,
  sampleRate = 44100,
  fftSize = 4096,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: FrequencyVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    if (!spectrum) {
      // No signal – draw idle text
      ctx.fillStyle = '#444';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for audio…', width / 2, height / 2);
      return;
    }

    const binHz = sampleRate / fftSize;
    const numBins = spectrum.length;

    // Only display 0–4200 Hz (handpan range + headroom)
    const maxDisplayHz = 4200;
    const maxBin = Math.min(numBins - 1, Math.ceil(maxDisplayHz / binHz));
    const barWidth = width / (maxBin + 1);

    // Highlight regions for fundamental, octave, fifth
    const highlightBins = new Set<number>();
    if (fundamentalFreq !== null) {
      const f1Bin = Math.round(fundamentalFreq / binHz);
      const f2Bin = Math.round((fundamentalFreq * 2) / binHz);
      const f3Bin = Math.round((fundamentalFreq * 3) / binHz);
      for (let d = -2; d <= 2; d++) {
        highlightBins.add(f1Bin + d);
        highlightBins.add(f2Bin + d);
        highlightBins.add(f3Bin + d);
      }
    }

    for (let i = 0; i <= maxBin; i++) {
      const db = Math.max(MIN_DB, Math.min(MAX_DB, spectrum[i]));
      const normalised = (db - MIN_DB) / (MAX_DB - MIN_DB);
      const barH = normalised * height;
      const x = i * barWidth;
      const y = height - barH;

      let color = '#1e6091'; // default blue

      if (fundamentalFreq !== null) {
        if (highlightBins.has(i)) {
          const f1Bin = Math.round(fundamentalFreq / binHz);
          const f2Bin = Math.round((fundamentalFreq * 2) / binHz);
          const f3Bin = Math.round((fundamentalFreq * 3) / binHz);
          const distF1 = Math.abs(i - f1Bin);
          const distF2 = Math.abs(i - f2Bin);
          const distF3 = Math.abs(i - f3Bin);
          if (distF1 <= distF2 && distF1 <= distF3) color = '#00ff88'; // fundamental – green
          else if (distF2 <= distF3) color = '#00aaff';                 // octave – blue
          else color = '#ff8800';                                        // fifth – orange
        }
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }

    // Frequency axis labels
    ctx.fillStyle = '#556';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const labelFreqs = [200, 500, 1000, 2000, 4000];
    for (const f of labelFreqs) {
      const x = (f / binHz) * barWidth;
      if (x < width) {
        ctx.fillText(`${f >= 1000 ? `${f / 1000}k` : f}`, x, height - 2);
      }
    }
  }, [spectrum, fundamentalFreq, sampleRate, fftSize, width, height]);

  return (
    <div className="frequency-visualizer">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="frequency-visualizer-canvas"
        aria-label="Frequency spectrum"
      />
      <div className="frequency-visualizer-legend">
        <span className="legend-item legend-fundamental">■ Fundamental</span>
        <span className="legend-item legend-octave">■ Octave</span>
        <span className="legend-item legend-fifth">■ Fifth</span>
      </div>
    </div>
  );
}
