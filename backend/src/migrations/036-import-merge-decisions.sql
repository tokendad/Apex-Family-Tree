CREATE TABLE IF NOT EXISTS import_merge_decisions (
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  xref TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('same','new')),
  candidate_person_id TEXT,
  field_resolutions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (import_job_id, xref)
);

CREATE INDEX IF NOT EXISTS idx_import_merge_decisions_job ON import_merge_decisions(import_job_id);
