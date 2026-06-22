-- Rectangular person tags within media items
CREATE TABLE IF NOT EXISTS media_person_regions (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  width REAL NOT NULL CHECK (width > 0 AND width <= 1),
  height REAL NOT NULL CHECK (height > 0 AND height <= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_person_regions_media ON media_person_regions(media_id);
CREATE INDEX IF NOT EXISTS idx_media_person_regions_person ON media_person_regions(person_id);
