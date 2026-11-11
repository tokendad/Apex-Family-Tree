-- Issue #73 Phase 1: AI Research Intake staging tables.
--
-- An intake_items row is one "turn" of pasted text submitted for extraction.
-- created_by is nullable with ON DELETE SET NULL, not NOT NULL -- the same
-- anti-pattern 064 fixed for audit_log.user_id and Phase 0 avoided for
-- ai_jobs.requested_by: deleting the user who submitted a turn must not fail
-- just because their id is still referenced here.
--
-- source_artifact_id points at an artifacts row created purely to give the
-- pasted text a citable archive_objects id (claim_evidence.evidence_object_id
-- requires one) -- see commitService.ts. source_hash lets a resubmission of
-- the same text be recognized rather than re-billing the LLM.
CREATE TABLE IF NOT EXISTS intake_items (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_text TEXT NOT NULL,
  source_artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL,
  ai_job_id TEXT REFERENCES ai_jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'awaiting_review', 'committed', 'cancelled', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_intake_items_status ON intake_items(status);
CREATE INDEX IF NOT EXISTS idx_intake_items_hash ON intake_items(source_hash);

-- payload is TEXT, not the SQLite "JSON" type name -- that name carries
-- NUMERIC affinity in SQLite and would silently coerce a numeric-looking
-- JSON string. import_jobs/import_conflicts store their JSON blobs as TEXT
-- for the same reason; this matches them.
CREATE TABLE IF NOT EXISTS intake_proposals (
  id TEXT PRIMARY KEY,
  intake_item_id TEXT NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('person', 'relationship', 'event', 'fact')),
  payload TEXT NOT NULL,
  confidence INTEGER CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  decision TEXT CHECK (decision IN ('accept', 'edit', 'reject')),
  edited_payload TEXT,
  committed_object_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_intake_proposals_item ON intake_proposals(intake_item_id);

-- import_conflicts, generalized to intake: both values plus their sources are
-- always shown, and resolution is always an explicit human choice -- #73's
-- "no conflict smoothing" rule applies here the same way the GEDCOM importer
-- already enforces it.
CREATE TABLE IF NOT EXISTS intake_conflicts (
  id TEXT PRIMARY KEY,
  intake_item_id TEXT NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES intake_proposals(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  existing_value TEXT,
  incoming_value TEXT,
  resolution TEXT CHECK (resolution IN ('accept_incoming', 'keep_existing', 'edit')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_intake_conflicts_item ON intake_conflicts(intake_item_id);

-- Unlike the GEDCOM importer (which writes thousands of rows per job and
-- suppresses per-record audit noise into import_audit_log, logging one
-- recordBulk summary afterwards), an intake commit writes a handful of rows
-- per submission through PersonRepository/EventRepository/ClaimRepository/
-- FamilyRepository -- each of which already calls recordChange() on its own.
-- That per-record trail is exactly what's wanted here, so import_audit_log
-- (which requires a NOT NULL import_jobs row intake has none of) is not
-- reused; commitService.ts calls recordBulk once after commit purely as a
-- single top-level "an intake was committed" marker.
