import { useEffect, useMemo, useRef } from 'react';
import { centsToColor } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 220; // px/s
const MAX_ACTIVE_SPEED = 220; // px/s
const MIN_ACTIVE_SPEED = 4; // px/s
const CENTER_GLIDE_SPEED = 1.5; // px/s when almost perfectly in tune
const STRIPE_HEIGHT = 20;
const STRIPE_GAP = 10;
const STRIPE_PITCH = STRIPE_HEIGHT + STRIPE_GAP;
const DRAW_OVERSCAN = 3;

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
    return IDLE_SPEED;
  }

  const clamped = clamp(cents, -maxDisplayCents, maxDisplayCents);
  const absCents = Math.abs(clamped);

  if (absCents < 0.18) {
    return fallbackDirection * CENTER_GLIDE_SPEED;
  }

  const direction = clamped > 0 ? -1 : 1; // positive cents should visually move up
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
      dark: '#08111d',
      track: '#0a1422',
      stripeBase: '#18304b',
      stripeDim: '#0f1d30',
      idleStripe: '#25415f',
      guide: '#d6e4f6',
    };
  }, [cents]);

  useEffect(() => {
    const state = animRef.current;
    state.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, state.directionMemory);
    if (active && cents !== null && Math.abs(cents) >= 0.18) {
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
      const now = timestamp;
      const lastTs = state.lastTs || now;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      state.lastTs = now;

      const response = active ? 0.15 : 0.06;
      state.velocity += (state.targetVelocity - state.velocity) * response;
      state.phase += state.velocity * dt;

      if (Math.abs(state.phase) > STRIPE_PITCH * 1000) {
        state.phase %= STRIPE_PITCH;
      }

      const currentCents = cents ?? 0;
      const absCents = Math.abs(clamp(currentCents, -maxDisplayCents, maxDisplayCents));
      const normalized = clamp(absCents / maxDisplayCents, 0, 1);
      const strongLock = active && absCents <= 8;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#07101a');
      bg.addColorStop(0.5, palette.track);
      bg.addColorStop(1, '#07101a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const laneGlow = ctx.createRadialGradient(width / 2, height / 2, 18, width / 2, height / 2, width * 0.45);
      laneGlow.addColorStop(0, active ? palette.accentDim : '#15263b');
      laneGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = laneGlow;
      ctx.fillRect(0, 0, width, height);

      const stripeInsetBase = 12;
      const stripeInsetDynamic = active ? 10 + (1 - normalized) * 8 : 6;
      const stripeInset = stripeInsetBase + stripeInsetDynamic;
      const stripeWidth = Math.max(16, width - stripeInset * 2);
      const corner = 7;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(6, 6, width - 12, height - 12, 16);
      ctx.clip();

      const startY = -STRIPE_PITCH * DRAW_OVERSCAN + (((state.phase % STRIPE_PITCH) + STRIPE_PITCH) % STRIPE_PITCH);
      const stripeCount = Math.ceil(height / STRIPE_PITCH) + DRAW_OVERSCAN * 2;

      ctx.shadowBlur = active ? 16 : 0;
      ctx.shadowColor = active ? palette.glow : 'transparent';

      for (let i = 0; i < stripeCount; i += 1) {
        const y = startY + i * STRIPE_PITCH;
        const useAccent = active ? i % 2 === 0 : i % 3 === 0;
        ctx.fillStyle = active
          ? useAccent
            ? palette.accent
            : strongLock
              ? '#d9e8f7'
              : palette.stripeBase
          : useAccent
            ? palette.idleStripe
            : palette.stripeDim;
        ctx.beginPath();
        ctx.roundRect(stripeInset, y, stripeWidth, STRIPE_HEIGHT, corner);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      const centerX = width / 2;
      const guideGradient = ctx.createLinearGradient(centerX - 5, 0, centerX + 5, 0);
      guideGradient.addColorStop(0, 'rgba(214, 228, 246, 0)');
      guideGradient.addColorStop(0.5, active ? palette.guide : '#5b6d84');
      guideGradient.addColorStop(1, 'rgba(214, 228, 246, 0)');
      ctx.fillStyle = guideGradient;
      ctx.fillRect(centerX - 5, 0, 10, height);

      const centerGlow = ctx.createRadialGradient(centerX, height / 2, 8, centerX, height / 2, 90);
      centerGlow.addColorStop(0, active ? palette.accentSoft : 'rgba(91, 109, 132, 0.3)');
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
