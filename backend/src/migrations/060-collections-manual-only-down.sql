-- Restore the 'smart' collection type and the belongs_to_collection type.
--
-- Same rebuild order as the up migration: drop before renaming, so SQLite does
-- not rewrite other tables' foreign keys to point at a table that is about to
-- disappear.

CREATE TABLE collections_old (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  collection_type TEXT NOT NULL DEFAULT 'manual' CHECK (collection_type IN ('manual', 'smart')),
  description TEXT,
  cover_artifact_id TEXT REFERENCES artifacts(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO collections_old (id, collection_type, description, cover_artifact_id, sort_order)
  SELECT id, collection_type, description, cover_artifact_id, sort_order FROM collections;

DROP TABLE collections;
ALTER TABLE collections_old RENAME TO collections;

CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(collection_type);

UPDATE relationship_types
   SET description = 'An archive object belongs to a collection.'
 WHERE code = 'belongs_to_collection';

-- better-sqlite3 bundles SQLite 3.49, well past the 3.35 that introduced
-- ALTER TABLE ... DROP COLUMN, so the flag goes away rather than lingering as
-- a column the pre-060 schema never had.
ALTER TABLE relationship_types DROP COLUMN is_active;
