import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { TuningResult } from '../contexts/AppContext';

type ShareResultCardProps = {
  selectedScale: string | null;
  tuningResults: TuningResult[];
  appUrl?: string;
  brandName?: string;
};

type ShareTone = 'excellent' | 'good' | 'attention' | 'retune';

type ShareSummary = {
  tone: ShareTone;
  badge: string;
  statusLabel: string;
  averageDeviation: number;
  checkedCount: number;
  healthScore: number;
  notesNeedingAttention: string[];
  highlightLine: string;
};

function formatAverage(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} cents`;
}

function buildShareSummary(tuningResults: TuningResult[]): ShareSummary {
  const checked = tuningResults.filter(
    (result) => result.status !== 'pending' && result.status !== 'skipped'
  );

  const inTune = checked.filter((result) => result.status === 'in-tune').length;
  const slightlyOut = checked.filter(
    (result) => result.status === 'slightly-out-of-tune'
  ).length;
  const outOfTune = checked.filter((result) => result.status === 'out-of-tune').length;

  const averageDeviation =
    checked.length > 0
      ? checked.reduce((sum, result) => sum + Math.abs(result.cents ?? 0), 0) / checked.length
      : 0;

  const healthScore =
    checked.length > 0 ? Math.round((inTune / checked.length) * 100) : 0;

  const notesNeedingAttention = checked
    .filter((result) => result.status !== 'in-tune')
    .map((result) => {
      const cents = result.cents;
      const formatted = cents === null ? '' : ` (${cents > 0 ? '+' : ''}${Math.round(cents)}c)`;
      return `${result.noteName}${formatted}`;
    })
    .slice(0, 3);

  if (outOfTune > 0) {
    return {
      tone: 'retune',
      badge: '❌',
      statusLabel: 'Needs Professional Attention',
      averageDeviation,
      checkedCount: checked.length,
      healthScore,
      notesNeedingAttention,
      highlightLine:
        notesNeedingAttention.length > 0
          ? `Focus notes: ${notesNeedingAttention.join(' • ')}`
          : 'Some notes are clearly out of tune.',
    };
  }

  if (slightlyOut >= 2 || averageDeviation > 8) {
    return {
      tone: 'attention',
      badge: '⚠️',
      statusLabel: 'Good with Room for Fine Tuning',
      averageDeviation,
      checkedCount: checked.length,
      healthScore,
      notesNeedingAttention,
      highlightLine:
        notesNeedingAttention.length > 0
          ? `Fine-tune candidates: ${notesNeedingAttention.join(' • ')}`
          : 'Minor drift detected on a few notes.',
    };
  }

  if (slightlyOut === 1) {
    return {
      tone: 'good',
      badge: '✅',
      statusLabel: 'Well Tuned',
      averageDeviation,
      checkedCount: checked.length,
      healthScore,
      notesNeedingAttention,
      highlightLine:
        notesNeedingAttention.length > 0
          ? `Only small drift on ${notesNeedingAttention[0]}`
          : 'Overall tuning looks solid.',
    };
  }

  return {
    tone: 'excellent',
    badge: '✅',
    statusLabel: 'Very Well Tuned',
    averageDeviation,
    checkedCount: checked.length,
    healthScore,
    notesNeedingAttention,
    highlightLine: 'Fundamental tuning looks very clean across the checked notes.',
  };
}

const paletteByTone: Record<ShareTone, { border: string; glow: string; chip: string }> = {
  excellent: { border: '#33d17a', glow: 'rgba(51, 209, 122, 0.22)', chip: 'rgba(51, 209, 122, 0.15)' },
  good: { border: '#61dafb', glow: 'rgba(97, 218, 251, 0.22)', chip: 'rgba(97, 218, 251, 0.14)' },
  attention: { border: '#ffb44c', glow: 'rgba(255, 180, 76, 0.22)', chip: 'rgba(255, 180, 76, 0.14)' },
  retune: { border: '#ff6b6b', glow: 'rgba(255, 107, 107, 0.24)', chip: 'rgba(255, 107, 107, 0.14)' },
};

const ShareResultCard: React.FC<ShareResultCardProps> = ({
  selectedScale,
  tuningResults,
  appUrl = 'tuner.dugimago.com',
  brandName = 'Dugimago Handpan Tuning Check',
}) => {
  const summary = useMemo(() => buildShareSummary(tuningResults), [tuningResults]);
  const palette = paletteByTone[summary.tone];

  return (
    <div style={{ ...cardStyle, borderColor: palette.border, boxShadow: `0 24px 80px ${palette.glow}` }} data-share-card="true">
      <div style={backgroundGlowStyle} aria-hidden="true" />

      <div style={topRowStyle}>
        <div style={brandBlockStyle}>
          <div style={logoCircleStyle}>DG</div>
          <div>
            <div style={eyebrowStyle}>Shareable Result Card</div>
            <div style={brandTitleStyle}>{brandName}</div>
          </div>
        </div>

        <div style={{ ...statusPillStyle, background: palette.chip, borderColor: palette.border }}>
          <span style={pillEmojiStyle}>{summary.badge}</span>
          <span>{summary.statusLabel}</span>
        </div>
      </div>

      <div style={headlineBlockStyle}>
        <div style={headlineStyle}>Handpan Check Result</div>
        <div style={subheadlineStyle}>{summary.highlightLine}</div>
      </div>

      <div style={gridStyle}>
        <MetricCard label="Scale" value={selectedScale ?? 'Unknown'} />
        <MetricCard label="Average deviation" value={formatAverage(summary.averageDeviation)} />
        <MetricCard label="Health score" value={`${summary.healthScore}%`} />
        <MetricCard label="Checked notes" value={String(summary.checkedCount)} />
      </div>

      <div style={footerAreaStyle}>
        <div style={attentionBlockStyle}>
          <div style={footerLabelStyle}>Notes needing attention</div>
          <div style={attentionValueStyle}>
            {summary.notesNeedingAttention.length > 0
              ? summary.notesNeedingAttention.join(' • ')
              : 'No major issues detected'}
          </div>
        </div>

        <div style={ctaBlockStyle}>
          <div style={footerLabelStyle}>Check your handpan</div>
          <div style={urlStyle}>{appUrl}</div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={metricCardStyle}>
    <div style={metricLabelStyle}>{label}</div>
    <div style={metricValueStyle}>{value}</div>
  </div>
);

const cardStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  maxWidth: 980,
  margin: '0 auto',
  padding: 28,
  borderRadius: 28,
  border: '1px solid',
  background:
    'radial-gradient(circle at top left, rgba(34, 67, 120, 0.42), transparent 34%), linear-gradient(145deg, #08111f 0%, #0d1730 42%, #111f3b 100%)',
  color: '#f5f7fb',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
};

const backgroundGlowStyle: CSSProperties = {
  position: 'absolute',
  right: -140,
  bottom: -180,
  width: 360,
  height: 360,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(0, 184, 255, 0.14), transparent 62%)',
  pointerEvents: 'none',
};

const topRowStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
};

const brandBlockStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const logoCircleStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #1da1f2 0%, #61dafb 100%)',
  color: '#041019',
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '0.05em',
};

const eyebrowStyle: CSSProperties = {
  opacity: 0.72,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontSize: 11,
  marginBottom: 4,
};

const brandTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const statusPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 999,
  border: '1px solid',
  fontSize: 14,
  fontWeight: 700,
};

const pillEmojiStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1,
};

const headlineBlockStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  marginTop: 26,
  marginBottom: 24,
};

const headlineStyle: CSSProperties = {
  fontSize: 40,
  lineHeight: 1.05,
  fontWeight: 800,
  letterSpacing: '-0.04em',
  marginBottom: 10,
};

const subheadlineStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.55,
  color: 'rgba(245, 247, 251, 0.8)',
  maxWidth: 760,
};

const gridStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 14,
};

const metricCardStyle: CSSProperties = {
  borderRadius: 20,
  padding: '16px 18px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backdropFilter: 'blur(10px)',
};

const metricLabelStyle: CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(245, 247, 251, 0.62)',
  marginBottom: 9,
};

const metricValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: '-0.03em',
};

const footerAreaStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  marginTop: 18,
  display: 'grid',
  gridTemplateColumns: '1.8fr 1fr',
  gap: 14,
};

const attentionBlockStyle: CSSProperties = {
  borderRadius: 20,
  padding: '18px 20px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const ctaBlockStyle: CSSProperties = {
  borderRadius: 20,
  padding: '18px 20px',
  background: 'linear-gradient(135deg, rgba(29, 161, 242, 0.14), rgba(97, 218, 251, 0.08))',
  border: '1px solid rgba(97, 218, 251, 0.18)',
};

const footerLabelStyle: CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(245, 247, 251, 0.62)',
  marginBottom: 8,
};

const attentionValueStyle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.45,
  fontWeight: 600,
};

const urlStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.2,
  fontWeight: 800,
  letterSpacing: '-0.03em',
  color: '#8ad9ff',
};

export default ShareResultCard;
export { buildShareSummary };
