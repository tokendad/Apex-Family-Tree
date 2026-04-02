-- Import audit log for tracking every record-level action during import
CREATE TABLE IF NOT EXISTS import_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'skipped', 'merged', 'error')),
  record_type TEXT NOT NULL,
  xref TEXT,
  internal_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_import_audit_job ON import_audit_log(import_job_id);
