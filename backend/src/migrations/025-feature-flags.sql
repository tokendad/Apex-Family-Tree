-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default feature flags
INSERT OR IGNORE INTO feature_flags (key, enabled, description) VALUES
  ('gedcom_import', 1, 'Enable GEDCOM file import'),
  ('gedcom_export', 1, 'Enable GEDCOM file export'),
  ('media_upload', 1, 'Enable media file uploads'),
  ('user_registration', 0, 'Enable public user registration'),
  ('email_notifications', 0, 'Enable email notifications'),
  ('advanced_search', 1, 'Enable advanced search features'),
  ('audit_logging', 1, 'Enable audit logging'),
  ('auto_backup', 1, 'Enable automatic backups'),
  ('gcp_integration', 0, 'Enable Google Cloud Platform integration');
