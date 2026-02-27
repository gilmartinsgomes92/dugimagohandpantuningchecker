/**
 * CentsGauge component
 *
 * Displays a horizontal analog-style Hz deviation meter with:
 * - A needle at the current Hz deviation position
 * - Tick marks at 0 (center), ±1, ±2, ±5 Hz
 * - Color coding: green near center, yellow in midrange, red at extremes
 */

import { hzToColor, HZ_THRESHOLD_PERFECT, HZ_THRESHOLD_VERY_GOOD, HZ_THRESHOLD_ACCEPTABLE, HZ_THRESHOLD_MARGINAL } from '../utils/musicUtils';

interface CentsGaugeProps {
  hz: number | null;
  maxHz?: number;
  label?: string;
}

const GAUGE_WIDTH = 280;
const GAUGE_HEIGHT = 60;
const NEEDLE_Y = 42;
const HALF = GAUGE_WIDTH / 2;
const MAX_DEFAULT = 5;

export function CentsGauge({ hz, maxHz = MAX_DEFAULT, label }: CentsGaugeProps) {
  // Clamp hz for display
  const displayHz = hz !== null ? Math.max(-maxHz, Math.min(maxHz, hz)) : 0;
  const normalised = displayHz / maxHz; // -1 to +1
  const needleX = HALF + normalised * (HALF - 8);

  const hasSignal = hz !== null;
  const color = hasSignal ? hzToColor(hz!) : '#555';

  // Tick marks at -5, -2, -1, 0, +1, +2, +5 Hz
  const ticks = [-5, -2, -1, 0, 1, 2, 5];

  // Zone proportions computed from Hz thresholds relative to maxHz
  const p1 = HZ_THRESHOLD_PERFECT / maxHz;    // 0–p1: green
  const p2 = HZ_THRESHOLD_VERY_GOOD / maxHz;  // p1–p2: yellow-green
  const p3 = HZ_THRESHOLD_ACCEPTABLE / maxHz; // p2–p3: yellow
  const p4 = HZ_THRESHOLD_MARGINAL / maxHz;   // p3–p4: orange, p4–1: red
  const hw = HALF - 8; // usable half-width in pixels

  return (
    <div className="cents-gauge">
      {label && <div className="cents-gauge-label">{label}</div>}
      <svg
        width={GAUGE_WIDTH}
        height={GAUGE_HEIGHT}
        viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
        role="img"
        aria-label={`Hz gauge: ${hz !== null ? hz.toFixed(2) : 'no signal'} Hz`}
      >
        {/* Background track */}
        <rect x={8} y={NEEDLE_Y - 2} width={GAUGE_WIDTH - 16} height={4} rx={2} fill="#2a2a2a" />

        {/* Color gradient zones */}
        {/* Red zones: ≥3 Hz from center */}
        <rect x={8} y={NEEDLE_Y - 2} width={hw * (1 - p4)} height={4} rx={2} fill="#330000" />
        <rect x={HALF + hw * p4} y={NEEDLE_Y - 2} width={hw * (1 - p4)} height={4} rx={2} fill="#330000" />
        {/* Orange zones: 2–3 Hz from center */}
        <rect x={8 + hw * (1 - p4)} y={NEEDLE_Y - 2} width={hw * (p4 - p3)} height={4} rx={2} fill="#332200" />
        <rect x={HALF + hw * p3} y={NEEDLE_Y - 2} width={hw * (p4 - p3)} height={4} rx={2} fill="#332200" />
        {/* Yellow zones: 1–2 Hz from center */}
        <rect x={8 + hw * (1 - p3)} y={NEEDLE_Y - 2} width={hw * (p3 - p2)} height={4} rx={2} fill="#333300" />
        <rect x={HALF + hw * p2} y={NEEDLE_Y - 2} width={hw * (p3 - p2)} height={4} rx={2} fill="#333300" />
        {/* Yellow-green zones: 0.5–1 Hz from center */}
        <rect x={8 + hw * (1 - p2)} y={NEEDLE_Y - 2} width={hw * (p2 - p1)} height={4} rx={2} fill="#223300" />
        <rect x={HALF + hw * p1} y={NEEDLE_Y - 2} width={hw * (p2 - p1)} height={4} rx={2} fill="#223300" />
        {/* Green center zone: 0–0.5 Hz from center */}
        <rect x={HALF - hw * p1} y={NEEDLE_Y - 2} width={hw * p1 * 2} height={4} rx={2} fill="#003322" />

        {/* Tick marks */}
        {ticks.map((tick) => {
          const x = HALF + (tick / maxHz) * (HALF - 8);
          const isCenter = tick === 0;
          const tickH = isCenter ? 16 : Math.abs(tick) >= 2 ? 12 : 8;
          return (
            <g key={tick}>
              <line
                x1={x}
                y1={NEEDLE_Y - tickH / 2}
                x2={x}
                y2={NEEDLE_Y + tickH / 2}
                stroke={isCenter ? '#888' : '#444'}
                strokeWidth={isCenter ? 2 : 1}
              />
              {(isCenter || Math.abs(tick) === 1 || Math.abs(tick) === 5) && (
                <text
                  x={x}
                  y={NEEDLE_Y - tickH / 2 - 3}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#555"
                >
                  {tick === 0 ? '0' : tick > 0 ? `+${tick}` : `${tick}`}
                </text>
              )}
            </g>
          );
        })}

        {/* Needle */}
        {hasSignal && (
          <g>
            <line
              x1={needleX}
              y1={NEEDLE_Y - 18}
              x2={needleX}
              y2={NEEDLE_Y + 6}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {/* Needle tip triangle */}
            <polygon
              points={`${needleX},${NEEDLE_Y - 20} ${needleX - 4},${NEEDLE_Y - 13} ${needleX + 4},${NEEDLE_Y - 13}`}
              fill={color}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
