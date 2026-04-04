import { useEffect, useMemo, useRef } from 'react';
import { centsToColor } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 64;
const MIN_TRACK_SPEED = 8;
const MAX_TRACK_SPEED = 260;
const PERFECT_GLIDE_SPEED = 1.25;
const STRIPE_HEIGHT = 30;
const STRIPE_GAP = 18;
const STRIPE_SPACING = STRIPE_HEIGHT + STRIPE_GAP;
const STRIPE_SHEAR = 18;
const TRACK_INSET = 10;
const CORNER_RADIUS = 18;

type RuntimeState = {
  lastTs: number;
  phase: number;
  velocity: number;
  targetVelocity: number;
  directionMemory: 1 | -1;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function velocityFromCents(
  cents: number | null,
  active: boolean,
  maxDisplayCents: number,
  rememberedDirection: 1 | -1,
): number {
  if (!active || cents === null || !Number.isFinite(cents)) {
    return rememberedDirection * IDLE_SPEED;
  }

  const clamped = clamp(cents, -maxDisplayCents, maxDisplayCents);
  const magnitude = Math.abs(clamped);

  if (magnitude < 0.12) {
    return rememberedDirection * PERFECT_GLIDE_SPEED;
  }

  const direction = clamped > 0 ? -1 : 1;
  const normalized = clamp(magnitude / maxDisplayCents, 0, 1);
  const curved = Math.pow(normalized, 0.72);
  return direction * (MIN_TRACK_SPEED + curved * (MAX_TRACK_SPEED - MIN_TRACK_SPEED));
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<RuntimeState>({
    lastTs: 0,
    phase: 0,
    velocity: IDLE_SPEED,
    targetVelocity: IDLE_SPEED,
    directionMemory: 1,
  });

  const liveRef = useRef({ cents, active, maxDisplayCents });
  useEffect(() => {
    liveRef.current = { cents, active, maxDisplayCents };
    const state = runtimeRef.current;
    state.targetVelocity = velocityFromCents(cents, active, maxDisplayCents, state.directionMemory);
    if (active && cents !== null && Number.isFinite(cents) && Math.abs(cents) >= 0.12) {
      state.directionMemory = cents > 0 ? -1 : 1;
    }
  }, [active, cents, maxDisplayCents]);

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#5d86c5';
    return {
      accent,
      accentStrong: `${accent}ee`,
      accentSoft: `${accent}99`,
      accentDim: `${accent}33`,
      trackTop: '#0a1626',
      trackMid: '#0d1b2d',
      trackBottom: '#07121f',
      stripeBright: '#dbe8ff',
      stripeIdle: '#86a7d2',
      stripeDark: '#18324e',
      center: '#f3f8ff',
      border: 'rgba(155, 188, 238, 0.2)',
    };
  }, [cents]);

  useEffect(() => {
    let raf = 0;

    const draw = (ts: number) => {
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
      const width = Math.max(1, canvas.clientWidth || 128);
      const height = Math.max(1, canvas.clientHeight || 360);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const state = runtimeRef.current;
      const { cents: liveCents, active: liveActive, maxDisplayCents: liveMax } = liveRef.current;
      const lastTs = state.lastTs || ts;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      state.lastTs = ts;

      const smoothing = liveActive ? 0.16 : 0.06;
      state.targetVelocity = velocityFromCents(liveCents, liveActive, liveMax, state.directionMemory);
      state.velocity += (state.targetVelocity - state.velocity) * smoothing;
      state.phase += state.velocity * dt;
      if (Math.abs(state.phase) > STRIPE_SPACING * 1000) {
        state.phase %= STRIPE_SPACING;
      }

      const clampedCents = liveCents === null ? null : clamp(liveCents, -liveMax, liveMax);
      const absCents = clampedCents === null ? null : Math.abs(clampedCents);
      const normalized = absCents === null ? 0 : clamp(absCents / liveMax, 0, 1);
      const isPerfectish = liveActive && absCents !== null && absCents <= 1.5;
      const brightness = liveActive ? 0.8 + normalized * 0.2 : 0.5;
      const stripeAlphaA = liveActive ? 0.72 + normalized * 0.18 : 0.42;
      const stripeAlphaB = liveActive ? 0.26 + normalized * 0.1 : 0.22;

      ctx.clearRect(0, 0, width, height);

      const outer = ctx.createLinearGradient(0, 0, 0, height);
      outer.addColorStop(0, palette.trackTop);
      outer.addColorStop(0.5, palette.trackMid);
      outer.addColorStop(1, palette.trackBottom);
      ctx.fillStyle = outer;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0.5, 0.5, width - 1, height - 1, CORNER_RADIUS);
      ctx.clip();

      const laneGlow = ctx.createRadialGradient(width / 2, height / 2, 16, width / 2, height / 2, width * 0.75);
      laneGlow.addColorStop(0, liveActive ? palette.accentDim : 'rgba(107, 142, 190, 0.16)');
      laneGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = laneGlow;
      ctx.fillRect(0, 0, width, height);

      const stripeWidth = width - TRACK_INSET * 2;
      const offset = ((state.phase % STRIPE_SPACING) + STRIPE_SPACING) % STRIPE_SPACING;
      const startY = -STRIPE_SPACING * 3 + offset;
      const stripeCount = Math.ceil(height / STRIPE_SPACING) + 7;

      ctx.shadowBlur = liveActive ? 18 : 8;
      ctx.shadowColor = liveActive ? palette.accentSoft : 'rgba(111, 146, 196, 0.18)';

      for (let i = 0; i < stripeCount; i += 1) {
        const y = startY + i * STRIPE_SPACING;
        const even = i % 2 === 0;
        const topLeftX = TRACK_INSET;
        const topRightX = TRACK_INSET + stripeWidth;
        const bottomRightX = TRACK_INSET + stripeWidth - STRIPE_SHEAR;
        const bottomLeftX = TRACK_INSET - STRIPE_SHEAR;

        ctx.beginPath();
        ctx.moveTo(topLeftX, y);
        ctx.lineTo(topRightX, y);
        ctx.lineTo(bottomRightX, y + STRIPE_HEIGHT);
        ctx.lineTo(bottomLeftX, y + STRIPE_HEIGHT);
        ctx.closePath();

        if (liveActive) {
          ctx.fillStyle = even
            ? `rgba(219, 232, 255, ${stripeAlphaA})`
            : `rgba(24, 50, 78, ${stripeAlphaB})`;
        } else {
          ctx.fillStyle = even
            ? 'rgba(134, 167, 210, 0.34)'
            : 'rgba(24, 50, 78, 0.28)';
        }
        ctx.fill();

        if (liveActive && even) {
          ctx.strokeStyle = palette.accentStrong;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0;

      const guideW = 8;
      const guideX = width / 2 - guideW / 2;
      const guideGradient = ctx.createLinearGradient(guideX, 0, guideX + guideW, 0);
      guideGradient.addColorStop(0, 'rgba(255,255,255,0)');
      guideGradient.addColorStop(0.5, liveActive ? 'rgba(243, 248, 255, 0.96)' : 'rgba(187, 206, 232, 0.7)');
      guideGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = guideGradient;
      ctx.fillRect(guideX, 0, guideW, height);

      if (liveActive) {
        const bloom = ctx.createRadialGradient(width / 2, height / 2, 6, width / 2, height / 2, width * 0.42);
        bloom.addColorStop(0, `rgba(255,255,255, ${0.14 + brightness * 0.1})`);
        bloom.addColorStop(0.35, palette.accentSoft);
        bloom.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, width, height);
      }

      const sideFade = ctx.createLinearGradient(0, 0, width, 0);
      sideFade.addColorStop(0, 'rgba(6, 13, 24, 0.9)');
      sideFade.addColorStop(0.16, 'rgba(6, 13, 24, 0.12)');
      sideFade.addColorStop(0.84, 'rgba(6, 13, 24, 0.12)');
      sideFade.addColorStop(1, 'rgba(6, 13, 24, 0.9)');
      ctx.fillStyle = sideFade;
      ctx.fillRect(0, 0, width, height);

      const topBottomFade = ctx.createLinearGradient(0, 0, 0, height);
      topBottomFade.addColorStop(0, 'rgba(6, 13, 24, 0.96)');
      topBottomFade.addColorStop(0.12, 'rgba(6, 13, 24, 0.08)');
      topBottomFade.addColorStop(0.88, 'rgba(6, 13, 24, 0.08)');
      topBottomFade.addColorStop(1, 'rgba(6, 13, 24, 0.96)');
      ctx.fillStyle = topBottomFade;
      ctx.fillRect(0, 0, width, height);

      if (isPerfectish) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, height * 0.49, width, height * 0.02);
      }

      ctx.restore();

      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(0.5, 0.5, width - 1, height - 1, CORNER_RADIUS);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [palette]);

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
