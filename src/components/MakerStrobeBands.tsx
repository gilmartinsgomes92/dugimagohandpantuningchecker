import { useEffect, useMemo, useRef } from 'react';
import { centsToColor } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 86; // px/s
const MAX_ACTIVE_SPEED = 300; // px/s
const MIN_ACTIVE_SPEED = 5; // px/s
const CENTER_GLIDE_SPEED = 1.4; // px/s when nearly locked
const STRIPE_HEIGHT = 16;
const STRIPE_GAP = 8;
const STRIPE_PITCH = STRIPE_HEIGHT + STRIPE_GAP;
const DRAW_OVERSCAN = 5;
const BAND_INSET = 10;
const EDGE_RADIUS = 16;

type AnimState = {
  phase: number;
  velocity: number;
  targetVelocity: number;
  lastTs: number;
  directionMemory: 1 | -1;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function centsToVelocity(cents: number | null, active: boolean, maxDisplayCents: number, fallbackDirection: 1 | -1): number {
  if (!active || cents === null || !Number.isFinite(cents)) {
    return fallbackDirection * IDLE_SPEED;
  }

  const clamped = clamp(cents, -maxDisplayCents, maxDisplayCents);
  const absCents = Math.abs(clamped);

  if (absCents < 0.12) {
    return fallbackDirection * CENTER_GLIDE_SPEED;
  }

  const direction = clamped > 0 ? -1 : 1; // positive cents should visually move up
  const normalized = clamp(absCents / maxDisplayCents, 0, 1);
  const curved = Math.pow(normalized, 0.72);
  const speed = MIN_ACTIVE_SPEED + curved * (MAX_ACTIVE_SPEED - MIN_ACTIVE_SPEED);
  return direction * speed;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<AnimState>({
    phase: 0,
    velocity: IDLE_SPEED,
    targetVelocity: IDLE_SPEED,
    lastTs: 0,
    directionMemory: 1,
  });

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#6a7f9d';
    return {
      accent,
      accentGlow: `${accent}aa`,
      accentSoft: `${accent}44`,
      accentFaint: `${accent}1f`,
      guide: '#ecf4ff',
      guideDim: '#6f85a2',
      bgTop: '#08111b',
      bgMid: '#0a1422',
      bgBottom: '#08111b',
      stripeBright: '#edf5ff',
      stripeMid: '#8fb0d3',
      stripeDim: '#304a68',
      idleBright: '#7f97b4',
      idleDim: '#22344d',
    };
  }, [cents]);

  useEffect(() => {
    const state = animRef.current;
    state.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, state.directionMemory);
    if (active && cents !== null && Number.isFinite(cents) && Math.abs(cents) >= 0.12) {
      state.directionMemory = cents > 0 ? -1 : 1;
    }
  }, [active, cents, maxDisplayCents]);

  useEffect(() => {
    let raf = 0;

    const draw = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || 128;
      const displayHeight = canvas.clientHeight || 360;
      const targetWidth = Math.round(displayWidth * dpr);
      const targetHeight = Math.round(displayHeight * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = displayWidth;
      const height = displayHeight;
      const state = animRef.current;
      const lastTs = state.lastTs || timestamp;
      const dt = Math.min(0.05, Math.max(0.001, (timestamp - lastTs) / 1000));
      state.lastTs = timestamp;

      const response = active ? 0.22 : 0.08;
      state.velocity += (state.targetVelocity - state.velocity) * response;
      state.phase += state.velocity * dt;
      if (Math.abs(state.phase) > STRIPE_PITCH * 1000) {
        state.phase %= STRIPE_PITCH;
      }

      const currentCents = cents ?? 0;
      const absCents = Math.abs(clamp(currentCents, -maxDisplayCents, maxDisplayCents));
      const normalized = clamp(absCents / maxDisplayCents, 0, 1);
      const strongLock = active && absCents <= 8;
      const flowDirection = state.velocity >= 0 ? 1 : -1;
      const motionStrength = active ? normalized : 0.35;
      const slope = (14 + motionStrength * 10) * flowDirection;
      const centerWindowWidth = Math.max(28, width * 0.25);
      const centerWindowLeft = width / 2 - centerWindowWidth / 2;
      const centerWindowRight = width / 2 + centerWindowWidth / 2;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, palette.bgTop);
      bg.addColorStop(0.5, palette.bgMid);
      bg.addColorStop(1, palette.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      drawRoundedRect(ctx, 4, 4, width - 8, height - 8, EDGE_RADIUS);
      ctx.save();
      ctx.clip();

      const edgeGlow = ctx.createLinearGradient(0, 0, width, 0);
      edgeGlow.addColorStop(0, active ? palette.accentFaint : 'rgba(66, 91, 123, 0.12)');
      edgeGlow.addColorStop(0.5, 'rgba(0,0,0,0)');
      edgeGlow.addColorStop(1, active ? palette.accentFaint : 'rgba(66, 91, 123, 0.12)');
      ctx.fillStyle = edgeGlow;
      ctx.fillRect(0, 0, width, height);

      const startY = -STRIPE_PITCH * DRAW_OVERSCAN + (((state.phase % STRIPE_PITCH) + STRIPE_PITCH) % STRIPE_PITCH);
      const stripeCount = Math.ceil(height / STRIPE_PITCH) + DRAW_OVERSCAN * 2;

      for (let i = 0; i < stripeCount; i += 1) {
        const y = startY + i * STRIPE_PITCH;
        const isAccentStripe = i % 3 === 0;
        const isBrightStripe = i % 2 === 0;

        ctx.fillStyle = active
          ? isAccentStripe
            ? palette.accent
            : strongLock
              ? palette.stripeBright
              : isBrightStripe
                ? palette.stripeMid
                : palette.stripeDim
          : isBrightStripe
            ? palette.idleBright
            : palette.idleDim;

        ctx.beginPath();
        ctx.moveTo(BAND_INSET + slope, y);
        ctx.lineTo(width - BAND_INSET + slope, y);
        ctx.lineTo(width - BAND_INSET - slope, y + STRIPE_HEIGHT);
        ctx.lineTo(BAND_INSET - slope, y + STRIPE_HEIGHT);
        ctx.closePath();
        ctx.fill();
      }

      const centerWindow = ctx.createLinearGradient(centerWindowLeft, 0, centerWindowRight, 0);
      centerWindow.addColorStop(0, 'rgba(7, 17, 29, 0.9)');
      centerWindow.addColorStop(0.18, active ? palette.accentSoft : 'rgba(127, 151, 180, 0.12)');
      centerWindow.addColorStop(0.5, 'rgba(255,255,255,0.025)');
      centerWindow.addColorStop(0.82, active ? palette.accentSoft : 'rgba(127, 151, 180, 0.12)');
      centerWindow.addColorStop(1, 'rgba(7, 17, 29, 0.9)');
      ctx.fillStyle = centerWindow;
      ctx.fillRect(centerWindowLeft, 0, centerWindowWidth, height);

      const guideGradient = ctx.createLinearGradient(width / 2 - 1.5, 0, width / 2 + 1.5, 0);
      guideGradient.addColorStop(0, 'rgba(236, 244, 255, 0)');
      guideGradient.addColorStop(0.5, active ? palette.guide : palette.guideDim);
      guideGradient.addColorStop(1, 'rgba(236, 244, 255, 0)');
      ctx.fillStyle = guideGradient;
      ctx.fillRect(width / 2 - 1.5, 0, 3, height);

      if (active) {
        ctx.strokeStyle = palette.accentGlow;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(width / 2 + flowDirection * 18, 18);
        ctx.lineTo(width / 2 + flowDirection * 4, 32);
        ctx.lineTo(width / 2 - flowDirection * 10, 46);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(width / 2 + flowDirection * 10, height - 46);
        ctx.lineTo(width / 2 - flowDirection * 4, height - 32);
        ctx.lineTo(width / 2 - flowDirection * 18, height - 18);
        ctx.stroke();
      }

      ctx.restore();

      const topFade = ctx.createLinearGradient(0, 0, 0, height * 0.16);
      topFade.addColorStop(0, 'rgba(7, 17, 29, 0.98)');
      topFade.addColorStop(1, 'rgba(7, 17, 29, 0)');
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, width, height * 0.16);

      const bottomFade = ctx.createLinearGradient(0, height, 0, height * 0.84);
      bottomFade.addColorStop(0, 'rgba(7, 17, 29, 0.98)');
      bottomFade.addColorStop(1, 'rgba(7, 17, 29, 0)');
      ctx.fillStyle = bottomFade;
      ctx.fillRect(0, height * 0.84, width, height * 0.16);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, cents, maxDisplayCents, palette]);

  return (
    <div className={`maker-strobe-band ${active ? 'is-active' : ''}`}>
      <div className="maker-strobe-band__label">{label}</div>
      <canvas
        ref={canvasRef}
        className="maker-strobe-band__canvas"
        width={128}
        height={360}
        aria-label={`${label} strobe band`}
      />
    </div>
  );
}
