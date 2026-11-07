-- Drops the table first: SQLite removes a table's triggers along with it,
-- so the no-update/no-delete guards need no separate DROP TRIGGER.
DROP TABLE IF EXISTS artifact_identification_history;

ALTER TABLE artifacts DROP COLUMN provenance_confidence_notes;
ALTER TABLE artifacts DROP COLUMN digitized_at;
