-- Fix foreign keys referencing non-existent "events_old" table.
-- When 031-events-expand-types.sql renamed "events" to "events_old" and dropped it,
-- SQLite automatically updated the foreign keys in "source_citations" and "event_media"
-- to reference "events_old", leaving them broken.

-- Recreate source_citations referencing events instead of events_old
CREATE TABLE source_citations_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  page TEXT,
  quality TEXT CHECK (quality IN ('primary', 'secondary', 'questionable', 'unreliable')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO source_citations_new SELECT * FROM source_citations;
DROP TABLE source_citations;
ALTER TABLE source_citations_new RENAME TO source_citations;

CREATE INDEX IF NOT EXISTS idx_citations_source ON source_citations(source_id);
CREATE INDEX IF NOT EXISTS idx_citations_person ON source_citations(person_id);
CREATE INDEX IF NOT EXISTS idx_citations_event ON source_citations(event_id);

-- Recreate event_media referencing events instead of events_old
CREATE TABLE event_media_new (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, media_id)
);

INSERT INTO event_media_new SELECT * FROM event_media;
DROP TABLE event_media;
ALTER TABLE event_media_new RENAME TO event_media;
