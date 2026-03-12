import type { TuningResult } from '../contexts/AppContext';

type ShareResultCardProps = {
  selectedScale: string | null;
  tuningResults: TuningResult[];
  appUrl?: string;
  brandName?: string;
};

type Verdict = {
  label: string;
  summary: string;
  accent: string;
  glow: string;
};

function getAverageAbsCents(results: TuningResult[]) {
  const values = results
    .map((r) => r.cents)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map((v) => Math.abs(v));

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMeasuredComponentValues(results: TuningResult[]) {
  return results
    .flatMap((r) => [r.cents, r.octaveCents, r.compoundFifthCents])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function getHealthScore(results: TuningResult[]) {
  const scored = results.filter(
    (r) => r.status !== 'pending' && r.status !== 'skipped'
  );

  const componentValues = getMeasuredComponentValues(scored);
  if (!componentValues.length) return 0;

  const inTuneComponents = componentValues.filter((value) => Math.abs(value) <= 12).length;
  return Math.round((inTuneComponents / componentValues.length) * 100);
}

function getNeedsAttentionCount(results: TuningResult[]) {
  return results.filter((r) => {
    if (r.status === 'pending' || r.status === 'skipped') return false;

    const values = [r.cents, r.octaveCents, r.compoundFifthCents]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (!values.length) return false;
    return values.some((value) => Math.abs(value) > 12);
  }).length;
}

function getVerdict(results: TuningResult[]): Verdict {
  const avgAbs = getAverageAbsCents(results);
  const needsAttention = getNeedsAttentionCount(results);
  const healthScore = getHealthScore(results);

  if (needsAttention === 0 && healthScore === 100) {
    return {
      label: 'In Tune',
      summary: 'All checked notes and partials are within 12 cents.',
      accent: '#4fd1a5',
      glow: 'rgba(79, 209, 165, 0.22)',
    };
  }

  if (needsAttention <= 2 && avgAbs <= 12 && healthScore >= 78) {
    return {
      label: 'Sounds Good',
      summary: 'Your handpan sounds good with some room for fine tuning.',
      accent: '#d4af37',
      glow: 'rgba(212, 175, 55, 0.20)',
    };
  }

  return {
    label: 'Needs Attention',
    summary: 'One or more notes or partials are outside the preferred tuning range.',
    accent: '#f6ad55',
    glow: 'rgba(246, 173, 85, 0.22)',
  };
}

export default function ShareResultCard({
  selectedScale,
  tuningResults,
  appUrl = 'tuner.dugimago.com',
  brandName = 'Dugimago',
}: ShareResultCardProps) {
  const total = tuningResults.length;
  const needsAttention = getNeedsAttentionCount(tuningResults);
  const healthScore = getHealthScore(tuningResults);
  const verdict = getVerdict(tuningResults);

  const summaryLine =
    needsAttention === 0
      ? 'All checked notes and partials are sounding healthy.'
      : needsAttention === 1
      ? '1 note has a component outside the preferred range.'
      : `${needsAttention} notes have components outside the preferred range.`;

  return (
    <div
      id="share-result-card"
      style={{
        width: 1080,
        minHeight: 1080,
        boxSizing: 'border-box',
        padding: '72px',
        borderRadius: 42,
        color: '#f8fafc',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background:
          'radial-gradient(circle at top left, rgba(212,175,55,0.18), transparent 32%), linear-gradient(180deg, #0d1522 0%, #101827 55%, #0b1220 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.05), transparent 35%, transparent 65%, rgba(255,255,255,0.03))',
        }}
      />

      <div
        style={{
          position: 'absolute',
          right: -120,
          top: -120,
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: verdict.glow,
          filter: 'blur(24px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 42 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 28,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#caa85e',
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {brandName}
            </div>
            <div
              style={{
                fontSize: 52,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                maxWidth: 580,
              }}
            >
              Handpan Check Result
            </div>
            <div
              style={{
                marginTop: 20,
                fontSize: 26,
                color: 'rgba(248,250,252,0.72)',
                maxWidth: 620,
                lineHeight: 1.5,
              }}
            >
              {summaryLine}
            </div>
          </div>

          <div
            style={{
              borderRadius: 999,
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${verdict.accent}55`,
              color: verdict.accent,
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {verdict.label}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.3fr 0.7fr',
            gap: 28,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              borderRadius: 30,
              padding: '34px 36px',
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.01), 0 20px 40px ${verdict.glow}`,
            }}
          >
            <div
              style={{
                fontSize: 22,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(248,250,252,0.58)',
                marginBottom: 18,
              }}
            >
              Instrument Summary
            </div>

            <div
              style={{
                fontSize: 76,
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: verdict.accent,
                marginBottom: 18,
              }}
            >
              {healthScore}%
            </div>

            <div
              style={{
                fontSize: 28,
                lineHeight: 1.35,
                color: '#f8fafc',
                marginBottom: 18,
                fontWeight: 600,
              }}
            >
              {verdict.summary}
            </div>

            <div
              style={{
                fontSize: 22,
                lineHeight: 1.65,
                color: 'rgba(248,250,252,0.74)',
                maxWidth: 620,
              }}
            >
              Measured components are classified as <strong>in tune</strong> up to 12 cents, <strong>slightly out</strong> from 12–17 cents, and <strong>out of tune</strong> above 17 cents.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 18,
            }}
          >
            {[
              ['Scale', selectedScale ?? 'Quick Tuning Check'],
              ['Checked Notes', String(total)],
              ['Notes Needing Work', `${needsAttention}`],
              ['Health Score', `${healthScore}%`],
              ['App', appUrl],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  borderRadius: 24,
                  padding: '22px 24px',
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'rgba(248,250,252,0.54)',
                    marginBottom: 10,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    lineHeight: 1.3,
                    fontWeight: 700,
                    color: '#f8fafc',
                    wordBreak: 'break-word',
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
