import { useEffect, useMemo, useRef } from 'react';
import { centsToColor, formatCents } from '../utils/musicUtils';

interface MakerStrobeBandsProps {
  cents: number | null;
  label: string;
  active: boolean;
  maxDisplayCents?: number;
  subLabel?: string;
}

const DEFAULT_MAX_DISPLAY_CENTS = 25;
const IDLE_SPEED = 18;
const MIN_ACTIVE_SPEED = 8;
const MAX_ACTIVE_SPEED = 230;
const CENTER_GLIDE_SPEED = 0.4;
const PATTERN_WRAP = 96;

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
  const curved = Math.pow(normalized, 0.82);
  const speed = MIN_ACTIVE_SPEED + curved * (MAX_ACTIVE_SPEED - MIN_ACTIVE_SPEED);
  const direction = clamped > 0 ? 1 : -1;
  return direction * speed;
}

export default function MakerStrobeBands({
  cents,
  label,
  active,
  maxDisplayCents = DEFAULT_MAX_DISPLAY_CENTS,
  subLabel,
}: MakerStrobeBandsProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const layerSecondaryRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef<MotionState>({
    phase: 0,
    velocity: IDLE_SPEED,
    targetVelocity: IDLE_SPEED,
    lastTs: 0,
    directionMemory: 1,
  });

  const palette = useMemo(() => {
    const accent = cents !== null ? centsToColor(cents) : '#6f88ab';
    return {
      accent,
      accentSoft: `${accent}66`,
      accentDim: `${accent}22`,
      text: '#edf4ff',
      idleText: '#9db0c8',
      laneBorder: active ? `${accent}44` : 'rgba(126, 151, 188, 0.18)',
      laneBg: 'linear-gradient(180deg, rgba(8, 15, 27, 0.98) 0%, rgba(6, 12, 22, 0.98) 100%)',
    };
  }, [active, cents]);

  useEffect(() => {
    const motion = motionRef.current;
    motion.targetVelocity = centsToVelocity(cents, active, maxDisplayCents, motion.directionMemory);
    if (active && cents !== null && Math.abs(cents) >= 0.1) {
      motion.directionMemory = cents > 0 ? 1 : -1;
    }
  }, [active, cents, maxDisplayCents]);

  useEffect(() => {
    let raf = 0;

    const animate = (timestamp: number) => {
      const motion = motionRef.current;
      const layer = layerRef.current;
      const layerSecondary = layerSecondaryRef.current;

      const lastTs = motion.lastTs || timestamp;
      const dt = Math.min(0.05, Math.max(0.001, (timestamp - lastTs) / 1000));
      motion.lastTs = timestamp;

      motion.velocity += (motion.targetVelocity - motion.velocity) * 0.18;
      motion.phase += motion.velocity * dt;

      if (motion.phase > PATTERN_WRAP) motion.phase -= PATTERN_WRAP;
      if (motion.phase < -PATTERN_WRAP) motion.phase += PATTERN_WRAP;

      const translate = `${motion.phase}px`;
      if (layer) layer.style.transform = `translate3d(${translate}, 0, 0)`;
      if (layerSecondary) layerSecondary.style.transform = `translate3d(calc(${translate} - ${PATTERN_WRAP}px), 0, 0)`;

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  const absCents = cents === null ? null : Math.abs(cents);
  const lockStrength = absCents === null ? 0 : clamp(1 - absCents / maxDisplayCents, 0, 1);
  const stripeOpacity = active ? 0.96 : 0.56;
  const centerGlowOpacity = active ? 0.16 + lockStrength * 0.34 : 0.12;
  const valueText = cents !== null ? formatCents(cents) : active ? 'Listening' : 'Idle';
  const directionText = cents === null ? '—' : cents > 0 ? 'Sharp' : cents < 0 ? 'Flat' : 'Centered';

  return (
    <section className="maker-cockpit-band" aria-label={`${label} strobe band`}>
      <div className="maker-cockpit-band__header">
        <div className="maker-cockpit-band__copy">
          <div className="maker-cockpit-band__label">{label}</div>
          <div className="maker-cockpit-band__sub">{subLabel ?? directionText}</div>
        </div>

        <div
          className="maker-cockpit-band__value"
          style={{
            color: active ? palette.text : palette.idleText,
            borderColor: active ? `${palette.accent}55` : 'rgba(126, 151, 188, 0.16)',
            boxShadow: active ? `0 0 0 1px ${palette.accent}12 inset` : 'none',
          }}
        >
          {valueText}
        </div>
      </div>

      <div
        className="maker-cockpit-band__lane"
        style={{
          borderColor: palette.laneBorder,
          background: palette.laneBg,
          boxShadow: active
            ? `0 0 0 1px ${palette.accent}12 inset, 0 18px 34px rgba(0,0,0,0.2)`
            : 'inset 0 0 0 1px rgba(255,255,255,0.03), 0 18px 34px rgba(0,0,0,0.18)',
        }}
      >
        <div className="maker-cockpit-band__film-frame">
          <div
            ref={layerRef}
            className="maker-cockpit-band__film"
            style={{
              opacity: stripeOpacity,
              backgroundImage: `repeating-linear-gradient(
                118deg,
                rgba(255,255,255,0) 0px,
                rgba(255,255,255,0) 14px,
                ${active ? palette.accent : 'rgba(88, 112, 146, 0.84)'} 14px,
                ${active ? palette.accent : 'rgba(88, 112, 146, 0.84)'} 26px,
                rgba(10, 18, 31, 0.12) 26px,
                rgba(10, 18, 31, 0.12) 38px
              )`,
            }}
          />
          <div
            ref={layerSecondaryRef}
            className="maker-cockpit-band__film"
            style={{
              opacity: stripeOpacity,
              backgroundImage: `repeating-linear-gradient(
                118deg,
                rgba(255,255,255,0) 0px,
                rgba(255,255,255,0) 14px,
                ${active ? palette.accent : 'rgba(88, 112, 146, 0.84)'} 14px,
                ${active ? palette.accent : 'rgba(88, 112, 146, 0.84)'} 26px,
                rgba(10, 18, 31, 0.12) 26px,
                rgba(10, 18, 31, 0.12) 38px
              )`,
            }}
          />
        </div>

        <div className="maker-cockpit-band__guide" />
        <div
          className="maker-cockpit-band__glow"
          style={{
            opacity: centerGlowOpacity,
            background: `radial-gradient(circle at 50% 50%, ${palette.accentSoft} 0%, ${palette.accentDim} 34%, rgba(0,0,0,0) 74%)`,
          }}
        />
        <div className="maker-cockpit-band__shade" />
      </div>
    </section>
  );
}
