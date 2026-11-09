-- Rebuild once more without 'dismiss' in the allowlist. Any row already
-- written with action = 'dismiss' would violate the restored CHECK, so this
-- only runs cleanly on a database where none exist yet.
DROP TRIGGER IF EXISTS audit_log_no_update;
DROP TRIGGER IF EXISTS audit_log_no_delete;

ALTER TABLE audit_log RENAME TO audit_log_old;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'create', 'update', 'delete',
    'import', 'merge', 'scan'
  )),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
SELECT id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at
FROM audit_log_old;

DROP TABLE audit_log_old;

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log entries cannot be modified');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log entries cannot be deleted');
END;
