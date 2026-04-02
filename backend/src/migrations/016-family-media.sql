-- Link families to media items
CREATE TABLE IF NOT EXISTS family_media (
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (family_id, media_id)
);
