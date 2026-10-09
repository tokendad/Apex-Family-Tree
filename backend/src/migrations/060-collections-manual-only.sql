-- Retire the unimplemented "smart" collection type, and retire the duplicate
-- membership mechanism (#26).
--
-- Two states were permitted that nothing in the application understands:
--
-- 1. collections.collection_type allowed 'smart', which would mean a saved
--    query that populates itself. Nothing implements it — no query format, no
--    evaluator, no UI — so a row set to 'smart' renders as an empty manual
--    collection with no way to tell why. A CHECK constraint that permits a
--    state nothing understands invites exactly that confusion later.
--
-- 2. 'belongs_to_collection' is a seeded relationship type, but membership
--    actually lives in collection_items, which carries caption and sort_order
--    that relationships cannot express. Two mechanisms for one idea means two
--    places to read and one of them silently wrong. collection_items is
--    canonical; the relationship type is retired rather than deleted, so
--    existing rows and their history survive and only new use is prevented.
--
-- The table rebuild below follows 056: create the replacement, copy, drop the
-- original, then rename. The pattern used by 031 and 041 — rename the original
-- out of the way first — makes SQLite rewrite other tables' foreign keys to
-- point at the renamed table, which then gets dropped. That broke "events"
-- twice. Dropping before renaming avoids it: nothing references
-- collections_new, so its rename rewrites nothing.

-- Any existing smart collection becomes manual; its items, if any, are real
-- rows in collection_items and are unaffected.
UPDATE collections SET collection_type = 'manual' WHERE collection_type <> 'manual';

CREATE TABLE collections_new (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  collection_type TEXT NOT NULL DEFAULT 'manual' CHECK (collection_type IN ('manual')),
  description TEXT,
  cover_artifact_id TEXT REFERENCES artifacts(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO collections_new (id, collection_type, description, cover_artifact_id, sort_order)
  SELECT id, collection_type, description, cover_artifact_id, sort_order FROM collections;

DROP TABLE collections;
ALTER TABLE collections_new RENAME TO collections;

CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(collection_type);
CREATE INDEX IF NOT EXISTS idx_collections_cover ON collections(cover_artifact_id);

-- Relationship types gain an active flag. Retiring a seeded type by deleting it
-- would cascade its roles away and orphan any relationship already recorded
-- with it; a flag keeps the history readable and only stops new use.
ALTER TABLE relationship_types ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

UPDATE relationship_types
   SET is_active = 0,
       description = 'Retired. Collection membership is recorded in collection_items, which also '
                     || 'carries caption and sort order. Kept so existing relationships remain '
                     || 'readable; not offered for new connections.'
 WHERE code = 'belongs_to_collection';
