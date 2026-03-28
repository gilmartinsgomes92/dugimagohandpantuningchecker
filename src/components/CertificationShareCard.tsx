import type { CertificationNoteAggregate } from '../types/certification';
import {
  getCertificationReportStats,
  getCertificationStatusClassName,
  getCertificationStatusLabel,
  getCertificationVerdict,
  getCertificationNoteStatus,
} from '../utils/certificationReportUtils';
import { formatCents } from '../utils/musicUtils';
import { statusText } from '../utils/certificationAggregation';

type CertificationShareCardProps = {
  aggregates: CertificationNoteAggregate[];
  generatedAt?: Date;
  brandName?: string;
  appUrl?: string;
  verificationId?: string;
};

function formatComponent(
  component: CertificationNoteAggregate['fundamental'],
): string {
  if (component.status !== 'measured' || component.cents === null) {
    return statusText(component);
  }

  const spreadText = component.spreadCents !== null ? ` · spread ${component.spreadCents.toFixed(1)}c` : '';
  return `${formatCents(component.cents)}${spreadText}`;
}

export default function CertificationShareCard({
  aggregates,
  generatedAt = new Date(),
  brandName = 'Dugimago',
  appUrl = 'tuner.dugimago.com',
  verificationId = 'Pending',
}: CertificationShareCardProps) {
  const measuredAggregates = aggregates.filter((aggregate) => aggregate.strikeCount > 0);
  const stats = getCertificationReportStats(measuredAggregates);
  const verdict = getCertificationVerdict(stats);
  const generatedLabel = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(generatedAt);

  return (
    <div
      id="certification-share-card"
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
          background:
            verdict.className === 'verdict-good'
              ? 'rgba(79, 209, 165, 0.22)'
              : verdict.className === 'verdict-bad'
              ? 'rgba(248, 113, 113, 0.20)'
              : 'rgba(212, 175, 55, 0.20)',
          filter: 'blur(24px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
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
            <div style={{ fontSize: 52, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.03em' }}>
              Certified Tuning Report
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 22,
                lineHeight: 1.45,
                color: '#f8fafc',
                maxWidth: 760,
                fontWeight: 600,
              }}
            >
              {verdict.badge} {verdict.label}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 19,
                lineHeight: 1.5,
                color: 'rgba(248,250,252,0.76)',
                maxWidth: 800,
              }}
            >
              {verdict.subtitle}
            </div>
          </div>

          <div
            style={{
              minWidth: 220,
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(8, 15, 28, 0.66)',
              padding: '22px 24px',
            }}
          >
            <div style={{ fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Certificate
            </div>
            <div style={{ marginTop: 12, fontSize: 34, fontWeight: 800 }}>{stats.healthScore}%</div>
            <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: 15 }}>Certified health score</div>
            <div style={{ marginTop: 18, color: '#cbd5e1', fontSize: 15 }}>
              {stats.measuredExpectedComponents}/{stats.certifiedExpectedComponents} expected components certified
            </div>
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 14 }}>Generated {generatedLabel}</div>
            <div style={{ marginTop: 10, color: '#f8fafc', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>
              Verification ID
            </div>
            <div style={{ marginTop: 4, color: '#caa85e', fontSize: 18, fontWeight: 800, letterSpacing: '0.04em' }}>
              {verificationId}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            ['Notes measured', String(stats.notesMeasured)],
            ['High confidence', String(stats.highConfidence)],
            ['Notes needing work', String(stats.notesNeedingAttention)],
            ['Inconclusive components', String(stats.inconclusiveComponents)],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(8, 15, 28, 0.5)',
                padding: '18px 20px',
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{value}</div>
              <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 15 }}>{label}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(8, 15, 28, 0.5)',
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Reading guide</div>
          <div style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.55 }}>
            Measured means at least 2 of 3 strikes confirmed the value. Not expected is for intentional octave-only tonefields. Inconclusive means the app heard the note, but that partial still needs a stronger confirmation pass.
          </div>
        </div>

        <div
          style={{
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(8, 15, 28, 0.56)',
            padding: '24px 24px 18px',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Per-note certified results</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f8fafc' }}>
            <thead>
              <tr>
                {['Note', 'Status', 'Fund.', 'Octave', '5th', 'Confidence'].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: 'left',
                      padding: '0 0 12px',
                      fontSize: 14,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#94a3b8',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measuredAggregates.map((aggregate, index) => {
                const noteStatus = getCertificationNoteStatus(aggregate);
                const noteStatusClass = getCertificationStatusClassName(noteStatus);
                return (
                  <tr key={`${aggregate.noteName}-${index}`}>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700 }}>
                      {aggregate.noteName}
                    </td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className={`status-chip ${noteStatusClass}`}>{getCertificationStatusLabel(noteStatus)}</span>
                    </td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{formatComponent(aggregate.fundamental)}</td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{formatComponent(aggregate.octave)}</td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{formatComponent(aggregate.compoundFifth)}</td>
                    <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textTransform: 'capitalize' }}>{aggregate.overallConfidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          <div style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.5, maxWidth: 760 }}>
            Detailed certified result generated by the Dugimago Handpan Tuning Check. Use this report alongside recordings, photos, and builder information when documenting tuning state for sales or verification.
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#caa85e', fontSize: 16, fontWeight: 700 }}>{appUrl}</div>
            <div style={{ color: '#94a3b8', fontSize: 15, marginTop: 4 }}>
              Checked with Dugimago Handpan Tuning Check
            </div>
            <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 6 }}>
              Use the Verification ID to confirm authenticity of this report.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
