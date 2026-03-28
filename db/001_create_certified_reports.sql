CREATE TABLE IF NOT EXISTS certified_reports (
  verification_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  note_count INTEGER NOT NULL,
  verdict_label TEXT NOT NULL,
  verdict_badge TEXT NOT NULL,
  verdict_class_name TEXT NOT NULL,
  verdict_subtitle TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  notes_measured INTEGER NOT NULL,
  notes_needing_attention INTEGER NOT NULL,
  measured_expected_components INTEGER NOT NULL,
  certified_expected_components INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  report_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certified_reports_created_at
ON certified_reports (created_at DESC);
