/**
 * HStrobeTuner — Horizontal Strobe Tuner
 *
 * Renders a canvas-based horizontal strobe display: vertical bands scroll left
 * or right at a speed proportional to the signed cents deviation from pitch
 * centre. When perfectly in tune the bands stop moving entirely.
 *
 * Visual behaviour:
 *   - cents > 0 (sharp) → bands scroll RIGHT
 *   - cents < 0 (flat)  → bands scroll LEFT
 *   - cents = 0 (in tune) → bands stationary
 *   - cents = null (no signal) → dim static bands + "Listening" prompt
 *
 * Speed mapping: speed_px_s = cents × SPEED_FACTOR, capped at ±MAX_SPEED.
 *   0¢ →   0 px/s   (stopped)
 *   5¢ →  20 px/s   (barely drifting)
 *  25¢ → 100 px/s   (clearly moving)
 *  50¢ → 200 px/s   (fast scroll)
 */

import { useRef, useEffect } from 'react';

const BAND_WIDTH   = 20;   // pixels per alternating band (lit or dark)
const SPEED_FACTOR = 4;    // pixels per second per cent of deviation
const MAX_SPEED    = 400;  // maximum scroll speed (px/s) — caps at ±100¢ equiv.

const COLOR_DARK_ACTIVE = '#0a0a0a'; // dark band when signal present
const COLOR_DARK_IDLE   = '#111';    // dark band when no signal

interface HStrobeTunerProps {
  /** Signed cents deviation from pitch centre; null when no audio signal. */
  cents: number | null;
  /** Detected note name shown in the centre overlay, e.g. "F4". */
  noteName?: string | null;
  /** Canvas render width in pixels (default 320). */
  width?: number;
  /** Canvas render height in pixels (default 80). */
  height?: number;
}

/** Returns the lit-band colour for a given absolute cents deviation. */
function litColor(absCents: number): string {
  if (absCents <=  2) return '#00ff88'; // green   — in tune
  if (absCents <=  5) return '#88ff44'; // lime
  if (absCents <= 10) return '#ffdd00'; // yellow
  if (absCents <= 20) return '#ff8800'; // orange
  return '#ff2200';                     // red     — far out
}

export function HStrobeTuner({
  cents,
  noteName,
  width  = 320,
  height = 80,
}: HStrobeTunerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state — lives in a ref so it survives re-renders without
  // requiring the animation loop to be restarted on every prop change.
  const animRef = useRef({
    cents:    cents,
    noteName: noteName ?? null,
    offset:   0,               // accumulated scroll offset in px
    lastTime: null as number | null,
  });

  // Keep animation state in sync with the latest props
  useEffect(() => {
    animRef.current.cents    = cents;
    animRef.current.noteName = noteName ?? null;
  }, [cents, noteName]);

  // Start the animation loop once on mount; never restart it
  useEffect(() => {
    let rafId: number;
    const period = BAND_WIDTH * 2;

    function loop(timestamp: number) {
      const canvas = canvasRef.current;
      if (!canvas) { rafId = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafId = requestAnimationFrame(loop); return; }

      const a = animRef.current;
      const dt = a.lastTime !== null ? (timestamp - a.lastTime) / 1000 : 0;
      a.lastTime = timestamp;

      // Advance offset proportional to cents deviation
      if (a.cents !== null) {
        const speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, a.cents * SPEED_FACTOR));
        a.offset += speed * dt;
      }

      const w = canvas.width;
      const h = canvas.height;
      const hasSignal = a.cents !== null;
      const absCents  = a.cents !== null ? Math.abs(a.cents) : 0;
      const bandLit   = hasSignal ? litColor(absCents) : '#2a2a2a';
      const bandDark  = hasSignal ? COLOR_DARK_ACTIVE  : COLOR_DARK_IDLE;

      // ── Draw scrolling bands ───────────────────────────────────────────────
      // shift: how far the pattern has scrolled right within one period (0 → period)
      const shift    = ((a.offset % period) + period) % period;
      // startX is always ≤ 0 so the bands cover the full canvas from x = 0
      const startX   = shift - period;

      ctx.clearRect(0, 0, w, h);

      for (let x = startX; x < w; x += BAND_WIDTH) {
        const bandIndex = Math.floor((x - startX) / BAND_WIDTH);
        ctx.fillStyle = bandIndex % 2 === 0 ? bandLit : bandDark;
        // +1 pixel overlap prevents hairline gaps caused by float rounding
        ctx.fillRect(x, 0, BAND_WIDTH + 1, h);
      }

      // ── Edge fade gradient (left & right vignette) ─────────────────────────
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const fadeStop = Math.min(40 / w, 0.15); // proportional fade width
      grad.addColorStop(0,          'rgba(10,10,10,0.75)');
      grad.addColorStop(fadeStop,   'rgba(10,10,10,0)');
      grad.addColorStop(1 - fadeStop, 'rgba(10,10,10,0)');
      grad.addColorStop(1,          'rgba(10,10,10,0.75)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // ── Centre reference line ───────────────────────────────────────────────
      const cx = w / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // ── Text overlay pill ──────────────────────────────────────────────────
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      if (hasSignal && a.noteName) {
        const centsVal = a.cents as number; // safe: hasSignal guarantees cents !== null
        // Semi-opaque pill background
        const pillW = 108;
        const pillH = 46;
        const px    = (w - pillW) / 2;
        const py    = (h - pillH) / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        // Manual rounded rectangle for broad browser compatibility
        const r = 8;
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + pillW - r, py);
        ctx.quadraticCurveTo(px + pillW, py, px + pillW, py + r);
        ctx.lineTo(px + pillW, py + pillH - r);
        ctx.quadraticCurveTo(px + pillW, py + pillH, px + pillW - r, py + pillH);
        ctx.lineTo(px + r, py + pillH);
        ctx.quadraticCurveTo(px, py + pillH, px, py + pillH - r);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();

        // Note name
        ctx.fillStyle = bandLit;
        ctx.font      = 'bold 18px system-ui, sans-serif';
        ctx.fillText(a.noteName, cx, py + 14);

        // Cents value
        const centsLabel =
          centsVal > 0  ? `+${centsVal.toFixed(1)}¢` :
          centsVal < 0  ? `${centsVal.toFixed(1)}¢`  :
                          '0.0¢';
        ctx.fillStyle = bandLit;
        ctx.font      = '13px ui-monospace, monospace';
        ctx.fillText(centsLabel, cx, py + 33);
      } else if (!hasSignal) {
        ctx.fillStyle = '#555';
        ctx.font      = '13px system-ui, sans-serif';
        ctx.fillText('🎵 Listening…', cx, h / 2);
      }

      ctx.restore();

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []); // intentionally empty — reads latest values from animRef

  return (
    <div className="h-strobe-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="h-strobe-canvas"
        aria-label={
          cents !== null
            ? `Strobe tuner: ${noteName ?? ''} ${cents >= 0 ? '+' : ''}${cents.toFixed(1)}¢`
            : 'Strobe tuner: no signal'
        }
      />
    </div>
  );
}
