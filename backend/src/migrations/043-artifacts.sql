-- Apex Family Legacy 2.0 artifact metadata foundation.
-- Artifacts are preserved archive objects. Files remain deferred until upload
-- and legacy media migration are implemented.

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  artifact_type_id TEXT NOT NULL REFERENCES artifact_types(id),
  evidence_classification_id TEXT REFERENCES evidence_classifications(id),
  original_date_text TEXT,
  original_date_start TEXT,
  original_date_end TEXT,
  date_precision TEXT,
  date_qualifier TEXT,
  creator_text TEXT,
  physical_location TEXT,
  original_format TEXT,
  condition_notes TEXT,
  language TEXT,
  transcription TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS artifact_files (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  file_role TEXT NOT NULL DEFAULT 'primary' CHECK (file_role IN (
    'primary',
    'original',
    'derivative',
    'thumbnail',
    'transcription',
    'other'
  )),
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum_sha256 TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_evidence ON artifacts(evidence_classification_id);
CREATE INDEX IF NOT EXISTS idx_artifact_files_artifact ON artifact_files(artifact_id);
