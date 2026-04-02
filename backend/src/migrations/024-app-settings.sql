-- Application settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'encrypted')),
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default settings
INSERT OR IGNORE INTO app_settings (key, value, value_type, description) VALUES
  ('instance_name', 'Apex Family Tree', 'string', 'Display name for this instance'),
  ('instance_timezone', 'UTC', 'string', 'Default timezone'),
  ('allow_registration', 'false', 'boolean', 'Allow public registration (invite-only by default)'),
  ('max_upload_size_mb', '10', 'number', 'Maximum file upload size in MB'),
  ('gedcom_default_version', '5.5.1', 'string', 'Default GEDCOM export version'),
  ('smtp_host', NULL, 'encrypted', 'SMTP server hostname'),
  ('smtp_port', '587', 'string', 'SMTP server port'),
  ('smtp_secure', 'false', 'boolean', 'Use TLS for SMTP'),
  ('smtp_user', NULL, 'encrypted', 'SMTP username'),
  ('smtp_pass', NULL, 'encrypted', 'SMTP password'),
  ('smtp_from', NULL, 'string', 'From address for emails');
