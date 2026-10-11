-- Reverse 062: drop 'anniversary' from the events.event_type CHECK constraint.
--
-- Any anniversary already recorded is demoted to 'other' FIRST. Without that
-- the INSERT below would fail the new table's own CHECK, aborting the
-- transaction -- and on a rollback that is run precisely because something has
-- gone wrong, failing is the worst available outcome. Demoting loses the type
-- but keeps the row, its date and its description, which is what 'other' meant
-- before this type existed.
UPDATE events SET event_type = 'other' WHERE event_type = 'anniversary';

-- Same rebuild discipline as the up migration: events is never renamed, so the
-- foreign keys in source_citations and event_media are left pointing at
-- "events" and are not rewritten to a table that is about to disappear. See
-- 062-events-anniversary-type.sql for the full history of that bug.
CREATE TABLE events_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'death', 'burial', 'cremation', 'baptism', 'christening',
    'bar_mitzvah', 'bat_mitzvah', 'confirmation', 'first_communion',
    'graduation', 'immigration', 'emigration', 'naturalization',
    'census', 'residence', 'occupation', 'retirement',
    'military_service', 'medical', 'custom',
    'probate', 'will', 'other', 'education', 'religion', 'ssn', 'title',
    'marriage', 'divorce', 'annulment', 'engagement',
    'marriage_bann', 'marriage_contract', 'marriage_license',
    'marriage_settlement'
  )),
  event_date TEXT,
  event_date_qualifier TEXT CHECK (event_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  event_date_sort_key INTEGER,
  event_place TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (person_id IS NOT NULL AND family_id IS NULL)
    OR
    (person_id IS NULL AND family_id IS NOT NULL)
  )
);

INSERT INTO events_new (
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
)
SELECT
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
FROM events;

DROP TABLE events;

ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
