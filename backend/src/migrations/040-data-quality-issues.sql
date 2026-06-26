-- Persistent tree data-quality issue ledger.
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  primary_entity_type TEXT NOT NULL,
  primary_entity_id TEXT NOT NULL,
  related_entities_json TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT NOT NULL UNIQUE,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  dismissed_at TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_quality_issues_status ON data_quality_issues(status);
CREATE INDEX IF NOT EXISTS idx_data_quality_issues_type ON data_quality_issues(type);
CREATE INDEX IF NOT EXISTS idx_data_quality_issues_severity ON data_quality_issues(severity);
CREATE INDEX IF NOT EXISTS idx_data_quality_issues_primary_entity
  ON data_quality_issues(primary_entity_type, primary_entity_id);
