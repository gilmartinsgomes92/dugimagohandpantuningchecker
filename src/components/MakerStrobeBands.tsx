import { useEffect, useMemo, useRef } from 'react';
import { centsToColor, formatCents } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 92;
const MIN_ACTIVE_SPEED = 6;
const MAX_ACTIVE_SPEED = 360;
const CENTER_GLIDE_SPEED = 0.8;
const LAYER_HEIGHT_PERCENT = 220;
const RESET_DISTANCE = 140;

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

  if (absCents < 0.1) {
    return fallbackDirection * CENTER_GLIDE_SPEED;
  }

  const normalized = clamp(absCents / maxDisplayCents, 0, 1);
  const curved = Math.pow(normalized, 0.8);
  const speed = MIN_ACTIVE_SPEED + curved * (MAX_ACTIVE_SPEED - MIN_ACTIVE_SPEED);
  const direction = clamped > 0 ? -1 : 1;
  return direction * speed;
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
}: MakerStrobeBandsProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
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
    const accent = cents !== null ? centsToColor(cents) : '#6e86a6';
    return {
      accent,
      accentSoft: `${accent}66`,
      accentDim: `${accent}22`,
      idleText: '#9cb1ca',
      text: '#e7f0fb',
      guide: 'rgba(230, 240, 252, 0.9)',
      laneBg: 'linear-gradient(180deg, rgba(6,13,22,0.98) 0%, rgba(10,18,31,0.98) 100%)',
    };
  }, [cents]);

  useEffect(() => {
    const motion = motionRef.current;
    motion.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, motion.directionMemory);
    if (active && cents !== null && Math.abs(cents) >= 0.1) {
      motion.directionMemory = cents > 0 ? -1 : 1;
    }

    if (glowRef.current) {
      glowRef.current.style.opacity = active ? '1' : '0.42';
      glowRef.current.style.background = `radial-gradient(circle at 50% 50%, ${palette.accentDim} 0%, rgba(0,0,0,0) 72%)`;
    }

    if (chipRef.current) {
      chipRef.current.style.color = active ? palette.text : palette.idleText;
      chipRef.current.style.borderColor = active ? `${palette.accent}55` : 'rgba(122, 146, 178, 0.16)';
      chipRef.current.style.boxShadow = active ? `0 0 0 1px ${palette.accent}14 inset` : 'none';
    }
  }, [active, cents, maxDisplayCents, palette]);

  useEffect(() => {
    let raf = 0;

    const animate = (timestamp: number) => {
      const layer = layerRef.current;
      if (!layer) {
        raf = requestAnimationFrame(animate);
        return;
      }

      const motion = motionRef.current;
      const lastTs = motion.lastTs || timestamp;
      const dt = Math.min(0.05, Math.max(0.001, (timestamp - lastTs) / 1000));
      motion.lastTs = timestamp;

      const response = active ? 0.24 : 0.08;
      motion.velocity += (motion.targetVelocity - motion.velocity) * response;
      motion.phase += motion.velocity * dt;

      if (motion.phase > RESET_DISTANCE) motion.phase -= RESET_DISTANCE;
      if (motion.phase < -RESET_DISTANCE) motion.phase += RESET_DISTANCE;

      layer.style.transform = `translate3d(0, ${motion.phase}px, 0)`;
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const absCents = cents === null ? null : Math.abs(cents);
  const lockStrength = absCents === null ? 0 : clamp(1 - absCents / maxDisplayCents, 0, 1);
  const centerOpacity = active ? 0.24 + lockStrength * 0.56 : 0.18;
  const stripeOpacity = active ? 0.92 : 0.5;

  return (
    <div className={`maker-strobe-band ${active ? 'is-active' : ''}`}>
      <div className="maker-strobe-band__label">{label}</div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '128px',
          height: '360px',
          overflow: 'hidden',
          borderRadius: '18px',
          border: '1px solid rgba(109, 140, 184, 0.18)',
          background: palette.laneBg,
          boxShadow: active ? `0 0 0 1px ${palette.accent}14 inset` : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
        }}
        aria-label={`${label} strobe band`}
      >
        <div
          ref={layerRef}
          style={{
            position: 'absolute',
            inset: `-${(LAYER_HEIGHT_PERCENT - 100) / 2}% 0`,
            backgroundImage: `
              repeating-linear-gradient(
                135deg,
                rgba(255,255,255,0) 0px,
                rgba(255,255,255,0) 12px,
                ${active ? palette.accent : 'rgba(74, 103, 138, 0.88)'} 12px,
                ${active ? palette.accent : 'rgba(74, 103, 138, 0.88)'} 24px,
                rgba(10,18,31,0.12) 24px,
                rgba(10,18,31,0.12) 36px
              )`,
            backgroundSize: '100% 72px',
            opacity: stripeOpacity,
            willChange: 'transform',
            filter: active ? 'saturate(1.18)' : 'saturate(0.88)',
          }}
        />

        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: '2px',
            transform: 'translateX(-50%)',
            background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${palette.guide} 18%, ${palette.guide} 82%, rgba(255,255,255,0) 100%)`,
            opacity: centerOpacity,
            boxShadow: `0 0 14px ${palette.accentSoft}`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(5,11,20,0.98) 0%, rgba(5,11,20,0.16) 14%, rgba(5,11,20,0.08) 50%, rgba(5,11,20,0.16) 86%, rgba(5,11,20,0.98) 100%)',
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
