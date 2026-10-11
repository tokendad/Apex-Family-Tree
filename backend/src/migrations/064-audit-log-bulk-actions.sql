-- The audit log was scaffolded for row-level CRUD: action was constrained to
-- create/update/delete and entity_id was NOT NULL. Real administrative actions
-- are not all row writes. A GEDCOM import, a person merge and a media scan each
-- touch thousands of rows and are worth one entry describing the decision, and
-- a scan has no single record it happened to. Under the old constraints those
-- inserts failed, and because recording an audit entry deliberately never
-- throws, they failed silently -- the exact operations most worth tracing were
-- the ones that would have gone unrecorded.
--
-- The same rebuild drops the foreign key on user_id, which was actively
-- harmful. It was ON DELETE SET NULL, and setting a column is an UPDATE, which
-- the append-only trigger aborts -- so once the log had any rows in it,
-- deleting a user who had ever made an edit would fail outright. Keeping the
-- id of a deleted account is also the better record: an audit entry should
-- still say who acted after the account is gone, and the viewer falls back to
-- showing the raw id when the join finds no user.
--
-- SQLite cannot alter a CHECK constraint, drop a NOT NULL or drop a foreign
-- key, so the table is rebuilt. The append-only triggers are recreated with
-- it; they do not prevent this, because DROP TABLE is not a DELETE.

DROP TRIGGER IF EXISTS audit_log_no_update;
DROP TRIGGER IF EXISTS audit_log_no_delete;

ALTER TABLE audit_log RENAME TO audit_log_old;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Deliberately not a foreign key; see the note above.
  user_id TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'create', 'update', 'delete',
    -- Bulk operations, recorded once as the decision that was taken.
    'import', 'merge', 'scan'
  )),
  entity_type TEXT NOT NULL,
  -- Nullable: a media scan acts on a directory, not on one record.
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
