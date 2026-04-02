-- Bidirectional GEDCOM cross-reference mapping
CREATE TABLE IF NOT EXISTS gedcom_xref_map (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  xref TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('INDI', 'FAM', 'SOUR', 'REPO', 'OBJE', 'NOTE')),
  internal_id TEXT NOT NULL,
  internal_table TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_xref_job ON gedcom_xref_map(import_job_id);
CREATE INDEX IF NOT EXISTS idx_xref_xref ON gedcom_xref_map(xref);
CREATE INDEX IF NOT EXISTS idx_xref_internal ON gedcom_xref_map(internal_id, internal_table);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xref_unique ON gedcom_xref_map(import_job_id, xref);
