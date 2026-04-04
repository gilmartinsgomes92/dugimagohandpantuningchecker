import { useEffect, useMemo, useRef } from 'react';
import { centsToColor } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const STRIPE_HEIGHT = 22;
const STRIPE_GAP = 10;
const STRIPE_COUNT = 18;
const BASE_SPEED = 0.85;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef({ offset: 0, lastTs: 0 });

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#5f7290';
    return {
      accent,
      glow: `${accent}55`,
      dark: '#0d1624',
      dim: '#152033',
      track: '#0b1220',
    };
  }, [cents]);

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

      const width = canvas.width;
      const height = canvas.height;
      const now = timestamp;
      const lastTs = animRef.current.lastTs || now;
      const dt = Math.max(0, (now - lastTs) / 1000);
      animRef.current.lastTs = now;

      const effectiveCents = cents ?? 0;
      const clamped = clamp(effectiveCents, -maxDisplayCents, maxDisplayCents);
      const normalized = Math.abs(clamped) / maxDisplayCents;
      const direction = clamped === 0 ? 0 : clamped > 0 ? 1 : -1;
      const speed = active ? direction * (BASE_SPEED + normalized * 4.8) : 0;
      animRef.current.offset += speed * STRIPE_HEIGHT * dt;

      const patternHeight = STRIPE_HEIGHT + STRIPE_GAP;
      const patternOffset = ((animRef.current.offset % patternHeight) + patternHeight) % patternHeight;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = palette.track;
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const guideWidth = 6;
      ctx.fillStyle = active ? `${palette.accent}40` : '#2a3952';
      ctx.fillRect(centerX - guideWidth / 2, 0, guideWidth, height);

      if (!active) {
        ctx.fillStyle = '#1d2a3f';
        for (let i = 0; i < STRIPE_COUNT; i += 1) {
          const y = i * patternHeight + 8;
          ctx.fillRect(14, y, width - 28, STRIPE_HEIGHT);
        }
      } else {
        ctx.shadowBlur = 14;
        ctx.shadowColor = palette.glow;
        for (let i = -2; i < STRIPE_COUNT + 2; i += 1) {
          const y = i * patternHeight + patternOffset;
          const stripeInset = 16 + normalized * 16;
          const stripeWidth = width - stripeInset * 2;
          ctx.fillStyle = i % 2 === 0 ? palette.accent : palette.dim;
          ctx.fillRect(stripeInset, y, stripeWidth, STRIPE_HEIGHT);
        }
        ctx.shadowBlur = 0;
      }

      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, '#07101dcc');
      fade.addColorStop(0.16, '#07101d00');
      fade.addColorStop(0.84, '#07101d00');
      fade.addColorStop(1, '#07101dcc');
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
