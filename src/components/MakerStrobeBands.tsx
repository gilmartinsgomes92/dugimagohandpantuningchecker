import { useEffect, useMemo, useRef } from 'react';
import { centsToColor } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 170;
const MAX_ACTIVE_SPEED = 220;
const MIN_ACTIVE_SPEED = 4;
const CENTER_GLIDE_SPEED = 1.3;
const STRIPE_HEIGHT = 22;
const STRIPE_GAP = 12;
const STRIPE_PITCH = STRIPE_HEIGHT + STRIPE_GAP;
const DRAW_OVERSCAN = 4;
const SLOPE_OFFSET = 16;

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

  if (absCents < 0.18) {
    return fallbackDirection * CENTER_GLIDE_SPEED;
  }

  const direction = clamped > 0 ? -1 : 1;
  const normalized = clamp(absCents / maxDisplayCents, 0, 1);
  const curved = Math.pow(normalized, 0.78);
  const speed = MIN_ACTIVE_SPEED + curved * (MAX_ACTIVE_SPEED - MIN_ACTIVE_SPEED);
  return direction * speed;
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestCentsRef = useRef<number | null>(cents);
  const latestActiveRef = useRef(active);
  const latestPaletteRef = useRef({
    accent: '#5f7290',
    accentSoft: '#5f729055',
    accentDim: '#5f729022',
    glow: '#5f729088',
    track: '#0a1422',
    stripeBase: '#18304b',
    stripeDim: '#0f1d30',
    idleStripe: '#25415f',
    guide: '#d6e4f6',
  });
  const animRef = useRef<AnimState>({
    phase: 0,
    velocity: IDLE_SPEED,
    targetVelocity: IDLE_SPEED,
    lastTs: 0,
    directionMemory: 1,
  });

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#5f7290';
    return {
      accent,
      accentSoft: `${accent}55`,
      accentDim: `${accent}22`,
      glow: `${accent}88`,
      track: '#0a1422',
      stripeBase: '#18304b',
      stripeDim: '#0f1d30',
      idleStripe: '#25415f',
      guide: '#d6e4f6',
    };
  }, [cents]);

  useEffect(() => {
    latestCentsRef.current = cents;
    latestActiveRef.current = active;
    latestPaletteRef.current = palette;

    const state = animRef.current;
    state.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, state.directionMemory);
    if (active && cents !== null && Math.abs(cents) >= 0.18) {
      state.directionMemory = cents > 0 ? -1 : 1;
    }
  }, [active, cents, maxDisplayCents, palette]);

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
      const currentCents = latestCentsRef.current;
      const currentActive = latestActiveRef.current;
      const currentPalette = latestPaletteRef.current;
      const now = timestamp;
      const lastTs = state.lastTs || now;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      state.lastTs = now;

      const response = currentActive ? 0.2 : 0.06;
      state.velocity += (state.targetVelocity - state.velocity) * response;
      state.phase += state.velocity * dt;

      if (Math.abs(state.phase) > STRIPE_PITCH * 1000) {
        state.phase %= STRIPE_PITCH;
      }

      const absCents = Math.abs(clamp(currentCents ?? 0, -maxDisplayCents, maxDisplayCents));
      const normalized = clamp(absCents / maxDisplayCents, 0, 1);
      const strongLock = currentActive && absCents <= 8;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#07101a');
      bg.addColorStop(0.5, currentPalette.track);
      bg.addColorStop(1, '#07101a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const laneGlow = ctx.createRadialGradient(width / 2, height / 2, 18, width / 2, height / 2, width * 0.45);
      laneGlow.addColorStop(0, currentActive ? currentPalette.accentDim : '#15263b');
      laneGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = laneGlow;
      ctx.fillRect(0, 0, width, height);

      const stripeInset = currentActive ? 18 - normalized * 4 : 16;
      const stripeWidth = Math.max(24, width - stripeInset * 2);
      const corner = 5;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(6, 6, width - 12, height - 12, 16);
      ctx.clip();

      const startY = -STRIPE_PITCH * DRAW_OVERSCAN + (((state.phase % STRIPE_PITCH) + STRIPE_PITCH) % STRIPE_PITCH);
      const stripeCount = Math.ceil(height / STRIPE_PITCH) + DRAW_OVERSCAN * 2;

      ctx.shadowBlur = currentActive ? 16 : 0;
      ctx.shadowColor = currentActive ? currentPalette.glow : 'transparent';

      for (let i = 0; i < stripeCount; i += 1) {
        const y = startY + i * STRIPE_PITCH;
        const x = (i % 2 === 0 ? stripeInset : stripeInset + SLOPE_OFFSET);
        const useAccent = currentActive ? i % 2 === 0 : i % 3 === 0;
        ctx.fillStyle = currentActive
          ? useAccent
            ? currentPalette.accent
            : strongLock
              ? '#d9e8f7'
              : currentPalette.stripeBase
          : useAccent
            ? currentPalette.idleStripe
            : currentPalette.stripeDim;
        ctx.beginPath();
        ctx.roundRect(x, y, stripeWidth - SLOPE_OFFSET, STRIPE_HEIGHT, corner);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      const centerX = width / 2;
      const guideGradient = ctx.createLinearGradient(centerX - 5, 0, centerX + 5, 0);
      guideGradient.addColorStop(0, 'rgba(214, 228, 246, 0)');
      guideGradient.addColorStop(0.5, currentActive ? currentPalette.guide : '#5b6d84');
      guideGradient.addColorStop(1, 'rgba(214, 228, 246, 0)');
      ctx.fillStyle = guideGradient;
      ctx.fillRect(centerX - 5, 0, 10, height);

      const centerGlow = ctx.createRadialGradient(centerX, height / 2, 8, centerX, height / 2, 90);
      centerGlow.addColorStop(0, currentActive ? currentPalette.accentSoft : 'rgba(91, 109, 132, 0.28)');
      centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();

      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, 'rgba(7, 16, 29, 0.98)');
      fade.addColorStop(0.14, 'rgba(7, 16, 29, 0.16)');
      fade.addColorStop(0.86, 'rgba(7, 16, 29, 0.16)');
      fade.addColorStop(1, 'rgba(7, 16, 29, 0.98)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [maxDisplayCents]);

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
