-- Add missing event types (marriage, divorce, annulment) to the CHECK constraint.
-- These types existed in the UI but were omitted from migration 031.
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.
-- The migrator disables FK enforcement for all migrations, so the
-- rename/copy/drop pattern works without breaking dependent tables.

-- Step 1: Rename old table
ALTER TABLE events RENAME TO events_old;

-- Step 2: Create new table with complete event type list
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

-- Step 3: Copy all existing data
INSERT INTO events SELECT * FROM events_old;

-- Step 4: Drop old table
DROP TABLE events_old;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
