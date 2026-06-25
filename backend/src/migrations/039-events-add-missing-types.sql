-- Add missing event types (marriage, divorce, annulment) to the CHECK constraint.
-- These types existed in the UI but were omitted from migration 031.
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.
-- source_citations and event_media must also be rebuilt because their FK
-- references to events are broken by the rename (same pattern as migration 037).

-- Step 1: Preserve dependent table data before rename breaks their FKs
CREATE TABLE source_citations_backup AS SELECT * FROM source_citations;
CREATE TABLE event_media_backup AS SELECT * FROM event_media;

-- Step 2: Rename events
ALTER TABLE events RENAME TO events_old;

-- Step 3: Recreate source_citations without the now-broken FK
DROP TABLE source_citations;
CREATE TABLE source_citations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events_old(id) ON DELETE CASCADE,
  page TEXT,
  quality TEXT CHECK (quality IN ('primary', 'secondary', 'questionable', 'unreliable')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO source_citations SELECT * FROM source_citations_backup;

-- Step 4: Recreate event_media without the now-broken FK
DROP TABLE event_media;
CREATE TABLE event_media (
  event_id TEXT NOT NULL REFERENCES events_old(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, media_id)
);
INSERT INTO event_media SELECT * FROM event_media_backup;

-- Step 5: Create new events table with expanded CHECK constraint
CREATE TABLE events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'death', 'burial', 'cremation', 'baptism', 'christening',
    'bar_mitzvah', 'bat_mitzvah', 'confirmation', 'first_communion',
    'graduation', 'immigration', 'emigration', 'naturalization',
    'census', 'residence', 'occupation', 'retirement',
    'military_service', 'medical', 'custom',
    'probate', 'will', 'other', 'education', 'religion', 'ssn', 'title',
    'marriage', 'divorce', 'annulment'
  )),
  event_date TEXT,
  event_date_qualifier TEXT CHECK (event_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  event_date_sort_key INTEGER,
  event_place TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 6: Copy events data
INSERT INTO events SELECT * FROM events_old;

-- Step 7: Repoint source_citations and event_media to new events table
DROP TABLE source_citations;
CREATE TABLE source_citations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  page TEXT,
  quality TEXT CHECK (quality IN ('primary', 'secondary', 'questionable', 'unreliable')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO source_citations SELECT * FROM source_citations_backup;

DROP TABLE event_media;
CREATE TABLE event_media (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, media_id)
);
INSERT INTO event_media SELECT * FROM event_media_backup;

-- Step 8: Drop temporaries
DROP TABLE events_old;
DROP TABLE source_citations_backup;
DROP TABLE event_media_backup;

-- Step 9: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
CREATE INDEX IF NOT EXISTS idx_citations_source ON source_citations(source_id);
CREATE INDEX IF NOT EXISTS idx_citations_person ON source_citations(person_id);
CREATE INDEX IF NOT EXISTS idx_citations_event ON source_citations(event_id);
