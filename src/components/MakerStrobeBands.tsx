import { useEffect, useMemo, useRef } from 'react';
import { centsToColor, formatCents } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  orientation?: 'vertical' | 'horizontal';
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 74;
const MIN_ACTIVE_SPEED = 12;
const MAX_ACTIVE_SPEED = 250;
const CENTER_GLIDE_SPEED = 0.9;
const LOOP_SPAN = 160;

type MotionState = {
  phase: number;
  velocity: number;
  targetVelocity: number;
  lastTs: number;
  directionMemory: 1 | -1;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function centsToVelocity(
  cents: number | null,
  active: boolean,
  maxDisplayCents: number,
  fallbackDirection: 1 | -1,
): number {
  if (!active || cents === null || !Number.isFinite(cents)) {
    return IDLE_SPEED * fallbackDirection;
  }

  const clamped = clamp(cents, -maxDisplayCents, maxDisplayCents);
  const absCents = Math.abs(clamped);
  if (absCents < 0.08) return fallbackDirection * CENTER_GLIDE_SPEED;

  const normalized = clamp(absCents / maxDisplayCents, 0, 1);
  const curved = Math.pow(normalized, 0.86);
  const speed = MIN_ACTIVE_SPEED + curved * (MAX_ACTIVE_SPEED - MIN_ACTIVE_SPEED);
  const direction = clamped > 0 ? -1 : 1;
  return direction * speed;
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  orientation = 'vertical',
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const filmRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef<MotionState>({
    phase: 0,
    velocity: IDLE_SPEED,
    targetVelocity: IDLE_SPEED,
    lastTs: 0,
    directionMemory: 1,
  });

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#5e7595';
    return {
      accent,
      stripe: active ? accent : 'rgba(84, 111, 145, 0.86)',
      stripeGlow: active ? `${accent}66` : 'rgba(90, 116, 148, 0.24)',
      text: '#eaf3ff',
      idleText: '#9cb1ca',
      frame: 'rgba(140, 177, 228, 0.18)',
      guide: 'rgba(255,255,255,0.72)',
      bg: 'linear-gradient(180deg, rgba(5,13,24,0.98) 0%, rgba(8,17,30,0.98) 100%)',
    };
  }, [active, cents]);

  useEffect(() => {
    const motion = motionRef.current;
    motion.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, motion.directionMemory);
    if (active && cents !== null && Math.abs(cents) >= 0.08) {
      motion.directionMemory = cents > 0 ? -1 : 1;
    }

    if (chipRef.current) {
      chipRef.current.style.color = active ? palette.text : palette.idleText;
      chipRef.current.style.borderColor = active ? `${palette.accent}55` : 'rgba(122, 146, 178, 0.16)';
      chipRef.current.style.boxShadow = active ? `0 0 0 1px ${palette.accent}12 inset` : 'none';
    }
  }, [active, cents, maxDisplayCents, palette]);

  useEffect(() => {
    let raf = 0;

    const animate = (timestamp: number) => {
      const film = filmRef.current;
      const glow = glowRef.current;
      if (!film) {
        raf = requestAnimationFrame(animate);
        return;
      }

      const motion = motionRef.current;
      const lastTs = motion.lastTs || timestamp;
      const dt = Math.min(0.05, Math.max(0.001, (timestamp - lastTs) / 1000));
      motion.lastTs = timestamp;

      motion.velocity += (motion.targetVelocity - motion.velocity) * (active ? 0.22 : 0.08);
      motion.phase += motion.velocity * dt;
      if (motion.phase > LOOP_SPAN) motion.phase -= LOOP_SPAN;
      if (motion.phase < -LOOP_SPAN) motion.phase += LOOP_SPAN;

      if (orientation === 'vertical') {
        film.style.backgroundPosition = `0px ${motion.phase}px`;
      } else {
        film.style.backgroundPosition = `${motion.phase}px 0px`;
      }

      if (glow) {
        const lockStrength = cents === null ? 0 : clamp(1 - Math.abs(cents) / maxDisplayCents, 0, 1);
        glow.style.opacity = active ? String(0.28 + lockStrength * 0.36) : '0.16';
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [active, cents, maxDisplayCents, orientation]);

  const isHorizontal = orientation === 'horizontal';
  const absCents = cents === null ? null : Math.abs(cents);
  const lockStrength = absCents === null ? 0 : clamp(1 - absCents / maxDisplayCents, 0, 1);

  return (
    <div
      className={`maker-strobe-band ${active ? 'is-active' : ''}`}
      style={{
        width: '100%',
        minWidth: 0,
      }}
    >
      <div className="maker-strobe-band__label">{label}</div>

      <div
        aria-label={`${label} strobe band`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isHorizontal ? '100%' : '168px',
          height: isHorizontal ? '96px' : '320px',
          overflow: 'hidden',
          borderRadius: '18px',
          border: `1px solid ${palette.frame}`,
          background: palette.bg,
          boxShadow: active ? `0 0 0 1px ${palette.accent}14 inset` : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        <div
          ref={filmRef}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: isHorizontal
              ? `repeating-linear-gradient(115deg,
                  rgba(255,255,255,0) 0px,
                  rgba(255,255,255,0) 18px,
                  ${palette.stripe} 18px,
                  ${palette.stripe} 31px,
                  rgba(10,18,31,0.08) 31px,
                  rgba(10,18,31,0.08) 50px)`
              : `repeating-linear-gradient(25deg,
                  rgba(255,255,255,0) 0px,
                  rgba(255,255,255,0) 18px,
                  ${palette.stripe} 18px,
                  ${palette.stripe} 31px,
                  rgba(10,18,31,0.08) 31px,
                  rgba(10,18,31,0.08) 50px)`,
            backgroundSize: isHorizontal ? '160px 100%' : '100% 160px',
            willChange: 'background-position',
            filter: active ? 'saturate(1.12) brightness(1.04)' : 'saturate(0.9)',
            opacity: active ? 0.96 : 0.52,
          }}
        />

        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: isHorizontal
              ? `radial-gradient(circle at 50% 50%, ${palette.stripeGlow} 0%, rgba(0,0,0,0) 64%)`
              : `radial-gradient(circle at 50% 50%, ${palette.stripeGlow} 0%, rgba(0,0,0,0) 64%)`,
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: isHorizontal ? '50%' : 0,
            bottom: isHorizontal ? 'auto' : 0,
            left: isHorizontal ? 0 : '50%',
            right: isHorizontal ? 0 : 'auto',
            width: isHorizontal ? 'auto' : '2px',
            height: isHorizontal ? '2px' : 'auto',
            transform: isHorizontal ? 'translateY(-50%)' : 'translateX(-50%)',
            background: isHorizontal
              ? `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${palette.guide} 18%, ${palette.guide} 82%, rgba(255,255,255,0) 100%)`
              : `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${palette.guide} 18%, ${palette.guide} 82%, rgba(255,255,255,0) 100%)`,
            opacity: active ? 0.28 + lockStrength * 0.52 : 0.18,
            boxShadow: `0 0 14px ${palette.stripeGlow}`,
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isHorizontal
              ? 'linear-gradient(90deg, rgba(5,11,20,0.98) 0%, rgba(5,11,20,0.15) 14%, rgba(5,11,20,0.05) 50%, rgba(5,11,20,0.15) 86%, rgba(5,11,20,0.98) 100%)'
              : 'linear-gradient(180deg, rgba(5,11,20,0.98) 0%, rgba(5,11,20,0.15) 14%, rgba(5,11,20,0.05) 50%, rgba(5,11,20,0.15) 86%, rgba(5,11,20,0.98) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div
        ref={chipRef}
        style={{
          marginTop: '8px',
          minWidth: '88px',
          padding: '6px 10px',
          borderRadius: '999px',
          border: '1px solid rgba(122, 146, 178, 0.16)',
          background: 'rgba(11, 19, 33, 0.86)',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          fontSize: '0.92rem',
          fontWeight: 600,
        }}
      >
        {cents !== null ? formatCents(cents) : 'listening'}
      </div>
    </div>
  );
}
