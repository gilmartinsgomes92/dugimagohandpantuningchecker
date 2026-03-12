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
  const checked = results.filter(
    (r) => r.status !== 'pending' && r.status !== 'skipped'
  );

  const hasSeriousIssue = checked.some((r) => {
    const values = [r.cents, r.octaveCents, r.compoundFifthCents]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return values.some((value) => Math.abs(value) > 17);
  });

  const hasModerateIssue = checked.some((r) => {
    const values = [r.cents, r.octaveCents, r.compoundFifthCents]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return values.some((value) => Math.abs(value) > 12);
  });

  if (!hasModerateIssue) {
    return {
      label: 'In Tune',
      summary: 'All checked notes and partials are within the preferred tuning range.',
      accent: '#4fd1a5',
      glow: 'rgba(79, 209, 165, 0.22)',
    };
  }

  if (hasSeriousIssue) {
    return {
      label: 'Needs Tuning Attention',
      summary: 'One or more notes are clearly outside the preferred tuning range.',
      accent: '#f6ad55',
      glow: 'rgba(246, 173, 85, 0.22)',
    };
  }

  return {
    label: 'Sounds Good',
    summary: 'Your handpan sounds good with some room for fine tuning.',
    accent: '#d4af37',
    glow: 'rgba(212, 175, 55, 0.20)',
  };
}

function formatSignedCents(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} cents`;
}

function getDetailedIssueSummary(results: TuningResult[]) {
  const checked = results.filter(
    (r) => r.status !== 'pending' && r.status !== 'skipped'
  );

  const issues = checked
    .map((r) => {
      const parts: string[] = [];

      if (typeof r.cents === 'number' && Number.isFinite(r.cents) && Math.abs(r.cents) > 12) {
        parts.push(`fundamental ${formatSignedCents(r.cents)}`);
      }

      if (
        typeof r.octaveCents === 'number' &&
        Number.isFinite(r.octaveCents) &&
        Math.abs(r.octaveCents) > 12
      ) {
        parts.push(`octave ${formatSignedCents(r.octaveCents)}`);
      }

      if (
        typeof r.compoundFifthCents === 'number' &&
        Number.isFinite(r.compoundFifthCents) &&
        Math.abs(r.compoundFifthCents) > 12
      ) {
        parts.push(`compound fifth ${formatSignedCents(r.compoundFifthCents)}`);
      }

      if (!parts.length) return null;

      if (parts.length === 1) {
        return `${r.noteName} is reading ${parts[0]}, which may make the note sound out of tune.`;
      }

      if (parts.length === 2) {
        return `${r.noteName} is reading ${parts[0]} and ${parts[1]}, which is likely to make the note sound noticeably out of tune.`;
      }

      return `${r.noteName} is reading ${parts[0]}, ${parts[1]}, and ${parts[2]}, which indicates a clear tuning issue.`;
    })
    .filter((value): value is string => Boolean(value));

  if (!issues.length) {
    return 'All checked notes and partials are within the preferred tuning range.';
  }

  if (issues.length === 1) return issues[0];
  if (issues.length === 2) return `${issues[0]} ${issues[1]}`;

  return `${issues[0]} ${issues[1]} ${issues.length - 2} more note${issues.length - 2 === 1 ? '' : 's'} also show tuning deviation.`;
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
  const detailedIssueSummary = getDetailedIssueSummary(tuningResults);

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
                maxWidth: 760,
              }}
            >
              Handpan Check Result
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 22,
                lineHeight: 1.5,
                color: '#f8fafc',
                maxWidth: 760,
                fontWeight: 600,
              }}
            >
              <span style={{ color: 'rgba(248,250,252,0.64)', fontWeight: 700 }}>
                Scale:{' '}
              </span>
              {selectedScale ?? 'Quick Tuning Check'}
            </div>

            <div
              style={{
                marginTop: 18,
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
              {detailedIssueSummary}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 18,
            }}
          >
            {[
  ['Checked Notes', String(total)],
  ['Notes Needing Work', `${needsAttention}`],
  ['Health Score', `${healthScore}%`],
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

<div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 22,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 18,
            color: 'rgba(248,250,252,0.78)',
            gap: 24,
          }}
        >
          <div
            style={{
              lineHeight: 1.4,
            }}
          >
            Checked with Dugimago Handpan Tuning Check
          </div>

          <div
            style={{
              color: '#caa85e',
              fontWeight: 700,
              fontSize: 18,
              whiteSpace: 'nowrap',
            }}
          >
            {appUrl}
          </div>
        </div>
      </div>
    </div>
  );
}
