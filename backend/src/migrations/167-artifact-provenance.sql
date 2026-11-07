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
-- level so no application code path -- present or future -- can edit the
-- content of an entry.
--
-- Unlike audit_log, this table has a real parent: artifact_id cascades from
-- artifacts, and the two person references cascade (as a SET NULL) from
-- archive_objects. A blanket "no UPDATE, no DELETE" pair blocks those
-- cascades too, which breaks deleting a person who has ever been named in
-- an identification (PersonRepository.delete) or merging one away
-- (personDedup's moveArchiveMemberships), and leaves a half-deleted media
-- row when an artifact itself is removed (MediaRepository.delete deletes
-- media_items before archive_objects, outside a transaction).
--
-- So the UPDATE guard only fires when something other than the two person
-- references changes -- note, artifact_id, confidence_level_id, created_by
-- and created_at are what "cannot be modified" actually protects; SET NULL
-- touches neither. And there is no DELETE guard at all: the only way a row
-- is ever deleted is the artifact_id cascade when its artifact is removed
-- entirely, which is the same lifecycle every other child of artifacts
-- (artifact_files, for one) already has. No route in this app deletes a
-- history row directly.
CREATE TRIGGER IF NOT EXISTS artifact_identification_history_no_update
BEFORE UPDATE ON artifact_identification_history
WHEN NEW.note IS NOT OLD.note
  OR NEW.artifact_id IS NOT OLD.artifact_id
  OR NEW.confidence_level_id IS NOT OLD.confidence_level_id
  OR NEW.created_by IS NOT OLD.created_by
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'Identification history entries cannot be modified');
END;
