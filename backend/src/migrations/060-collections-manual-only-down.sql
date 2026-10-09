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

-- SQLite cannot drop a column on older versions, so is_active is left in place
-- and simply reset. It defaults to 1, which is the pre-migration behaviour.
UPDATE relationship_types
   SET is_active = 1,
       description = 'An archive object belongs to a collection.'
 WHERE code = 'belongs_to_collection';
