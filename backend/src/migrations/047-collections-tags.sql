-- Apex Family Legacy 2.0 collections and tags.
-- Collections are curated archive objects. Tags are lightweight discovery aids,
-- not folders and not collection substitutes.

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  collection_type TEXT NOT NULL DEFAULT 'manual' CHECK (collection_type IN ('manual', 'smart')),
  description TEXT,
  cover_artifact_id TEXT REFERENCES artifacts(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  added_by TEXT,
  UNIQUE (collection_id, item_object_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS object_tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (object_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(collection_type);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_object ON collection_items(item_object_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_order ON collection_items(collection_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_object_tags_object ON object_tags(object_id);
CREATE INDEX IF NOT EXISTS idx_object_tags_tag ON object_tags(tag_id);
