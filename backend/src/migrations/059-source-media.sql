-- Link sources to media items.
--
-- Persons, families and events could all carry media; sources could not, so
-- there was nowhere to attach a scan of the record a citation points at — the
-- census sheet, the muster roll page, the parish register image. A source is
-- exactly the kind of thing a user wants to see a picture of.
--
-- Mirrors event_media: a plain join table, cascading from either side.
CREATE TABLE IF NOT EXISTS source_media (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_source_media_media ON source_media(media_id);
