-- GEDCOM export jobs
CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  gedcom_version TEXT NOT NULL DEFAULT '5.5.1' CHECK (gedcom_version IN ('5.5.1', '7.0')),
  scope TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'ancestors', 'descendants', 'date_range')),
  scope_person_id TEXT REFERENCES persons(id),
  scope_start_date TEXT,
  scope_end_date TEXT,
  media_option TEXT NOT NULL DEFAULT 'links' CHECK (media_option IN ('zip', 'base64', 'links')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path TEXT,
  total_records INTEGER DEFAULT 0,
  error_message TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON export_jobs(user_id);
