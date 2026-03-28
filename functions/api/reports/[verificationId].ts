export interface Env {
  CERT_REPORTS_DB: D1Database;
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const verificationId = String(context.params.verificationId ?? '').toUpperCase();

    if (!verificationId) {
      return json({ error: 'Verification ID is required.' }, { status: 400 });
    }

    const row = await context.env.CERT_REPORTS_DB
      .prepare('SELECT report_json FROM certified_reports WHERE verification_id = ?')
      .bind(verificationId)
      .first<{ report_json: string }>();

    if (!row?.report_json) {
      return json({ error: 'Report not found.' }, { status: 404 });
    }

    return json({ ok: true, report: JSON.parse(row.report_json) });
  } catch {
    return json({ error: 'Could not load report.' }, { status: 500 });
  }
};
