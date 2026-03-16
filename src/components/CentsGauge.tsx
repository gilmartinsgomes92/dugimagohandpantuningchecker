/**
 * CentsGauge component
 *
 * Displays a horizontal analog-style cents meter with:
 * - A needle at the current cents deviation position
 * - Tick marks at 0 (center), ±5, ±10, ±20, ±50 cents
 * - Color coding: green near center, yellow in midrange, red at extremes
 */

import { centsToColor } from '../utils/musicUtils';

interface CentsGaugeProps {
  cents: number | null;
  maxCents?: number;
  label?: string;
}

const GAUGE_WIDTH = 280;
const GAUGE_HEIGHT = 60;
const NEEDLE_Y = 42;
const HALF = GAUGE_WIDTH / 2;
const MAX_DEFAULT = 50;

export function CentsGauge({ cents, maxCents = MAX_DEFAULT, label }: CentsGaugeProps) {
  // Clamp cents for display
  const displayCents = cents !== null ? Math.max(-maxCents, Math.min(maxCents, cents)) : 0;
  const normalised = displayCents / maxCents; // -1 to +1
  const needleX = HALF + normalised * (HALF - 8);

  const hasSignal = cents !== null;
  const color = hasSignal ? centsToColor(cents!) : '#555';

  // Tick marks at -50, -20, -10, -5, 0, +5, +10, +20, +50
  const ticks = [-50, -20, -10, -5, 0, 5, 10, 20, 50];

  return (
    <div className="cents-gauge">
      {label && <div className="cents-gauge-label">{label}</div>}
      <svg
        width={GAUGE_WIDTH}
        height={GAUGE_HEIGHT}
        viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
        role="img"
        aria-label={`Cents gauge: ${cents !== null ? cents.toFixed(1) : 'no signal'}¢`}
      >
        {/* Background track */}
        <rect x={8} y={NEEDLE_Y - 2} width={GAUGE_WIDTH - 16} height={4} rx={2} fill="#2a2a2a" />

        {/* Color gradient zones */}
        {/* Red zones */}
        <rect x={8} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.4} height={4} rx={2} fill="#330000" />
        <rect x={HALF + (HALF - 8) * 0.6} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.4} height={4} rx={2} fill="#330000" />
        {/* Orange zones */}
        <rect x={8 + (HALF - 8) * 0.4} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.2} height={4} rx={2} fill="#332200" />
        <rect x={HALF + (HALF - 8) * 0.4} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.2} height={4} rx={2} fill="#332200" />
        {/* Yellow zones */}
        <rect x={8 + (HALF - 8) * 0.6} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.2} height={4} rx={2} fill="#333300" />
        <rect x={HALF + (HALF - 8) * 0.2} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.2} height={4} rx={2} fill="#333300" />
        {/* Green center zone */}
        <rect x={HALF - (HALF - 8) * 0.2} y={NEEDLE_Y - 2} width={(HALF - 8) * 0.4} height={4} rx={2} fill="#003322" />

        {/* Tick marks */}
        {ticks.map((tick) => {
          const x = HALF + (tick / maxCents) * (HALF - 8);
          const isCenter = tick === 0;
          const tickH = isCenter ? 16 : Math.abs(tick) >= 20 ? 12 : 8;
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
              {(isCenter || Math.abs(tick) === 10 || Math.abs(tick) === 50) && (
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
