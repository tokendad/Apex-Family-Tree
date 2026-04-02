-- Link persons to media items
CREATE TABLE IF NOT EXISTS person_media (
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (person_id, media_id)
);
