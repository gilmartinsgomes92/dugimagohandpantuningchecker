/**
 * StrobeDisk component
 *
 * Renders an animated strobe tuner disk using a Canvas.
 * The disk pattern rotates at a speed proportional to the frequency deviation
 * (cents off from target). When perfectly in tune, the disk appears stationary.
 *
 * Rotation rate: angular_velocity (rad/s) = 2pi * (f_detected - f_target) / N_segments
 */

import { useRef, useEffect } from 'react';

interface StrobeDiskProps {
  detectedFreq: number | null;
  referenceFreq: number | null;
  /** Number of alternating segment pairs (default 12 -> 24 total segments) */
  numSegments?: number;
  /** Disk diameter in pixels */
  size?: number;
  label: string;
  color?: string;
  active?: boolean;
}

const DEFAULT_SEGMENTS = 12;
const DEFAULT_SIZE = 200;
const DEFAULT_COLOR = '#00d4ff';

export function StrobeDisk({
  detectedFreq,
  referenceFreq,
  numSegments = DEFAULT_SEGMENTS,
  size = DEFAULT_SIZE,
  label,
  color = DEFAULT_COLOR,
  active = false,
}: StrobeDiskProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state that persists across renders without triggering re-renders
  const animRef = useRef({
    active,
    detectedFreq,
    referenceFreq,
    numSegments,
    color,
    angle: 0,
    lastTime: null as number | null,
  });

  // Sync latest props into animRef without mutating during render
  useEffect(() => {
    animRef.current.active = active;
    animRef.current.detectedFreq = detectedFreq;
    animRef.current.referenceFreq = referenceFreq;
    animRef.current.numSegments = numSegments;
    animRef.current.color = color;
  }, [active, detectedFreq, referenceFreq, numSegments, color]);

  // Start animation loop once on mount, never restart
  useEffect(() => {
    let rafId: number;

    function loop(timestamp: number) {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const a = animRef.current;
      const dt = a.lastTime !== null ? (timestamp - a.lastTime) / 1000 : 0;
      a.lastTime = timestamp;

      if (a.active && a.detectedFreq !== null && a.referenceFreq !== null && a.referenceFreq > 0) {
        const freqDiff = a.detectedFreq - a.referenceFreq;
        a.angle += (2 * Math.PI * freqDiff) / a.numSegments * dt;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 4;
      const innerRadius = radius * 0.25;
      const totalSeg = a.numSegments * 2;

      ctx.clearRect(0, 0, w, h);

      if (!a.active || a.detectedFreq === null || a.referenceFreq === null) {
        drawSegments(ctx, cx, cy, radius, innerRadius, totalSeg, a.angle, '#333', '#1a1a1a');
        drawCenter(ctx, cx, cy, innerRadius);
        drawRing(ctx, cx, cy, radius, '#333');
      } else {
        const cents = 1200 * Math.log2(a.detectedFreq / a.referenceFreq);
        const abs = Math.abs(cents);
        const segColor =
          abs <= 2  ? '#00ff88' :
          abs <= 5  ? '#88ff44' :
          abs <= 10 ? '#ffdd00' :
          abs <= 20 ? '#ff8800' :
                      '#ff2200';
        drawSegments(ctx, cx, cy, radius, innerRadius, totalSeg, a.angle, segColor, '#111');
        drawCenter(ctx, cx, cy, innerRadius);
        drawRing(ctx, cx, cy, radius, a.color);
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []); // intentionally empty - reads latest values from animRef

  return (
    <div className="strobe-disk-container">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="strobe-disk-canvas"
        aria-label={`${label} strobe disk`}
      />
      <div className="strobe-disk-label">{label}</div>
    </div>
  );
}

function drawSegments(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  outerR: number, innerR: number,
  total: number, angle: number,
  litColor: string, darkColor: string
) {
  const segAngle = (2 * Math.PI) / total;
  for (let i = 0; i < total; i++) {
    const s = angle + i * segAngle;
    const e = s + segAngle;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(s), cy + innerR * Math.sin(s));
    ctx.arc(cx, cy, outerR, s, e);
    ctx.arc(cx, cy, innerR, e, s, true);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? litColor : darkColor;
    ctx.fill();
  }
}

function drawCenter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = '#1c1c1c';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}
