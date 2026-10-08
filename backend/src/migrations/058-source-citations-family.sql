-- Give source_citations a family subject.
--
-- GEDCOM 5.5.1 allows a SOUR on a FAM record, attesting the family grouping
-- itself rather than any one event within it. source_citations had only
-- person_id and event_id, so such a citation had nowhere to land. Attaching it
-- to the family's marriage event would have needed no migration, but it
-- conflates "this marriage happened" with "this family grouping is attested",
-- and it loses the citation entirely for a family that has no marriage event.
--
-- ADD COLUMN rather than a table rebuild: rebuilding a table whose foreign keys
-- point at events has twice rewritten them to a dropped events_old (031, 041,
-- repaired in 037 and 056).
--
-- See https://github.com/tokendad/Apex-Family-Tree/issues/36.
ALTER TABLE source_citations ADD COLUMN family_id TEXT REFERENCES families(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_citations_family ON source_citations(family_id);
