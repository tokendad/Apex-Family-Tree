-- Artifact provenance: digitisation date, confidence notes, and an
-- append-only identification history.
--
-- Ownership, donation and scanning are already representable as
-- relationships (rel_type_owned_by/donated_by/scanned_by, role contracts in
-- 051) -- a relationship carries its own date range, so "original owner"
-- and "current owner" are just two owned_by relationships with different
-- dates. What's missing is the dated facts with no person on the other end
-- (digitised_at, confidence notes) and a protected history of who
-- identified what in an artifact and when, which must never be silently
-- overwritten.

ALTER TABLE artifacts ADD COLUMN digitized_at TEXT;
ALTER TABLE artifacts ADD COLUMN provenance_confidence_notes TEXT;

-- identified_person_id is who the entry is about (nullable -- the subject
-- may not be a known, linkable person, e.g. "probably Grade 6").
-- identifier_person_id is who made the call. note carries the actual
-- identification content and is the one required field.
CREATE TABLE IF NOT EXISTS artifact_identification_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  identified_person_id TEXT REFERENCES archive_objects(id) ON DELETE SET NULL,
  identifier_person_id TEXT REFERENCES archive_objects(id) ON DELETE SET NULL,
  confidence_level_id TEXT REFERENCES confidence_levels(id),
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artifact_identification_history_artifact
  ON artifact_identification_history(artifact_id);

-- Same idiom as audit_log (026): insert-only, enforced at the database
-- level so a history entry cannot be edited or removed by any code path,
-- present or future.
CREATE TRIGGER IF NOT EXISTS artifact_identification_history_no_update
BEFORE UPDATE ON artifact_identification_history
BEGIN
  SELECT RAISE(ABORT, 'Identification history entries cannot be modified');
END;

CREATE TRIGGER IF NOT EXISTS artifact_identification_history_no_delete
BEFORE DELETE ON artifact_identification_history
BEGIN
  SELECT RAISE(ABORT, 'Identification history entries cannot be deleted');
END;
