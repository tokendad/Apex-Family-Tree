-- Issue #76: the People Merge scan has no way to say "these two are not
-- the same person" -- so a pair dismissed once keeps resurfacing on every
-- later scan.
--
-- person_a_id/person_b_id are always stored with person_a_id < person_b_id
-- (enforced by the CHECK, written that way by dismissDuplicatePair), so the
-- pair has one canonical row no matter which side of a group the caller
-- names first, and a scan can test membership with a single lookup instead
-- of trying both orders.
CREATE TABLE IF NOT EXISTS dismissed_duplicate_pairs (
  person_a_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_b_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  dismissed_by TEXT,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (person_a_id, person_b_id),
  CHECK (person_a_id < person_b_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_duplicate_pairs_b ON dismissed_duplicate_pairs(person_b_id);
