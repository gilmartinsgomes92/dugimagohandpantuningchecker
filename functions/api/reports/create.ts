export interface Env {
  CERT_REPORTS_DB: D1Database;
}

type CertificationReportRecord = {
  verificationId: string;
  createdAt: string;
  noteCount: number;
  aggregates: unknown;
  stats: unknown;
  verdict: unknown;
  appVersion: string;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const payload = (await context.request.json()) as CertificationReportRecord;

    if (!payload?.verificationId || !payload?.createdAt || !Array.isArray(payload?.aggregates)) {
      return json({ error: 'Invalid certified report payload.' }, { status: 400 });
    }

    await context.env.CERT_REPORTS_DB
      .prepare(
        `INSERT OR REPLACE INTO certified_reports (
          verification_id,
          created_at,
          note_count,
          verdict_label,
          verdict_badge,
          verdict_class_name,
          verdict_subtitle,
          health_score,
          notes_measured,
          notes_needing_attention,
          measured_expected_components,
          certified_expected_components,
          app_version,
          report_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        payload.verificationId,
        payload.createdAt,
        payload.noteCount,
        (payload.verdict as { label?: string })?.label ?? '',
        (payload.verdict as { badge?: string })?.badge ?? '',
        (payload.verdict as { className?: string })?.className ?? '',
        (payload.verdict as { subtitle?: string })?.subtitle ?? '',
        (payload.stats as { healthScore?: number })?.healthScore ?? 0,
        (payload.stats as { notesMeasured?: number })?.notesMeasured ?? 0,
        (payload.stats as { notesNeedingAttention?: number })?.notesNeedingAttention ?? 0,
        (payload.stats as { measuredExpectedComponents?: number })?.measuredExpectedComponents ?? 0,
        (payload.stats as { certifiedExpectedComponents?: number })?.certifiedExpectedComponents ?? 0,
        payload.appVersion ?? 'unknown',
        JSON.stringify(payload),
      )
      .run();

    return json({ ok: true, verificationId: payload.verificationId });
  } catch {
    return json({ error: 'Could not save certified report.' }, { status: 500 });
  }
};
