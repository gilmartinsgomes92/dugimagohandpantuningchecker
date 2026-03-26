import type { CertificationNoteAggregate } from '../types/certification';
import { formatCents } from '../utils/musicUtils';
import { statusText } from '../utils/certificationAggregation';

type CertificationShareCardProps = {
  aggregates: CertificationNoteAggregate[];
  verdictLabel: string;
  verdictSummary: string;
  certifiedHealthScore: number;
  notesNeedingWork: number;
  measuredComponents: number;
  totalExpectedComponents: number;
  appUrl?: string;
  brandName?: string;
};

function componentOutOfTune(cents: number | null, status: string): boolean {
  return status === 'measured' && typeof cents === 'number' && Number.isFinite(cents) && Math.abs(cents) > 12;
}

function formatComponent(cents: number | null, status: string) {
  if (status === 'measured' && typeof cents === 'number' && Number.isFinite(cents)) {
    return formatCents(cents);
  }
  return statusText({ status, cents: null, spreadCents: null, validStrikeCount: 0, confidence: 'uncertain' } as any);
}

export default function CertificationShareCard({
  aggregates,
  verdictLabel,
  verdictSummary,
  certifiedHealthScore,
  notesNeedingWork,
  measuredComponents,
  totalExpectedComponents,
  appUrl = 'tuner.dugimago.com',
  brandName = 'Dugimago',
}: CertificationShareCardProps) {
  return (
    <div
      id="certification-share-card"
      style={{
        width: 1080,
        minHeight: 1080,
        boxSizing: 'border-box',
        padding: '68px',
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

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
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
            <div style={{ fontSize: 52, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.03em', maxWidth: 760 }}>
              Certified Tuning Report
            </div>
            <div style={{ marginTop: 16, fontSize: 22, lineHeight: 1.5, color: '#dbe7ff', maxWidth: 760 }}>
              Three-strike certification summary for handpan tuning verification.
            </div>
          </div>

          <div
            style={{
              minWidth: 250,
              padding: '20px 24px',
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Verdict</div>
            <div style={{ marginTop: 10, fontSize: 30, fontWeight: 800, color: '#f8fafc' }}>{verdictLabel}</div>
            <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.45, color: '#dbe7ff' }}>{verdictSummary}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 18 }}>
          {[
            { value: `${certifiedHealthScore}%`, label: 'Certified Health Score' },
            { value: `${notesNeedingWork}`, label: 'Notes Needing Work' },
            { value: `${measuredComponents}/${totalExpectedComponents}`, label: 'Expected Components Certified' },
            { value: `${aggregates.length}`, label: 'Notes Included' },
          ].map((item) => (
            <div key={item.label} style={{ borderRadius: 22, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', padding: '20px 22px' }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>{item.value}</div>
              <div style={{ marginTop: 8, fontSize: 15, color: '#dbe7ff' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: 26, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', background: 'rgba(6, 11, 20, 0.56)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 18 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '18px 20px' }}>Note</th>
                <th style={{ padding: '18px 20px' }}>Fund.</th>
                <th style={{ padding: '18px 20px' }}>Octave</th>
                <th style={{ padding: '18px 20px' }}>5th</th>
                <th style={{ padding: '18px 20px' }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((aggregate, index) => {
                const rowNeedsWork =
                  componentOutOfTune(aggregate.fundamental.cents, aggregate.fundamental.status) ||
                  componentOutOfTune(aggregate.octave.cents, aggregate.octave.status) ||
                  componentOutOfTune(aggregate.compoundFifth.cents, aggregate.compoundFifth.status);

                return (
                  <tr key={`${aggregate.noteName}-${index}`} style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <td style={{ padding: '18px 20px', fontWeight: 700 }}>
                      {aggregate.noteName}
                      {rowNeedsWork ? <span style={{ marginLeft: 10, color: '#f6ad55' }}>●</span> : null}
                    </td>
                    <td style={{ padding: '18px 20px' }}>{formatComponent(aggregate.fundamental.cents, aggregate.fundamental.status)}</td>
                    <td style={{ padding: '18px 20px' }}>{formatComponent(aggregate.octave.cents, aggregate.octave.status)}</td>
                    <td style={{ padding: '18px 20px' }}>{formatComponent(aggregate.compoundFifth.cents, aggregate.compoundFifth.status)}</td>
                    <td style={{ padding: '18px 20px', textTransform: 'capitalize' }}>{aggregate.overallConfidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-end', marginTop: 'auto' }}>
          <div style={{ maxWidth: 760, fontSize: 18, lineHeight: 1.5, color: '#dbe7ff' }}>
            Certified values require at least two confirming strikes. “Not expected” is used for intentional octave-only tonefields. “Inconclusive” means the app could not certify that component strongly enough yet.
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, color: 'rgba(248,250,252,0.68)' }}>{appUrl}</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
              Checked with Dugimago Handpan Tuning Check
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
