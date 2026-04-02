-- Import conflict records
CREATE TABLE IF NOT EXISTS import_conflicts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  xref TEXT NOT NULL,
  record_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  existing_value TEXT,
  incoming_value TEXT,
  resolution TEXT CHECK (resolution IN ('skip', 'overwrite', 'merge', NULL)),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conflicts_job ON import_conflicts(import_job_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON import_conflicts(import_job_id) WHERE resolution IS NULL;
