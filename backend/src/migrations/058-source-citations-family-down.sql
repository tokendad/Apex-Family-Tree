-- Remove the family subject from source_citations.
DROP INDEX IF EXISTS idx_citations_family;
ALTER TABLE source_citations DROP COLUMN family_id;
