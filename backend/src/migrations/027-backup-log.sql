-- Backup tracking log
CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('startup', 'pre_migration', 'scheduled', 'manual', 'pre_import')),
  filename TEXT NOT NULL,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('started', 'completed', 'failed')),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backup_type ON backup_log(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_log(created_at);
