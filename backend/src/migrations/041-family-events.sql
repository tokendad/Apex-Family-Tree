-- Normalize family-level GEDCOM facts into the shared events table.
-- SQLite cannot alter the existing NOT NULL / CHECK constraints in place, so
-- we rebuild the table, preserve person events, and backfill family events.

ALTER TABLE events RENAME TO events_old;

CREATE TABLE events (
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

INSERT INTO events (
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
)
SELECT
  id, person_id, NULL, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
FROM events_old;

INSERT INTO events (
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  f.id,
  'marriage',
  f.marriage_date,
  COALESCE(f.marriage_date_qualifier, 'exact'),
  f.marriage_date_sort_key,
  f.marriage_place,
  NULL,
  f.created_at,
  f.updated_at
FROM families f
WHERE COALESCE(f.marriage_date, '') != ''
   OR COALESCE(f.marriage_place, '') != '';

INSERT INTO events (
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, description, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  f.id,
  'divorce',
  f.divorce_date,
  'exact',
  NULL,
  f.divorce_place,
  NULL,
  f.created_at,
  f.updated_at
FROM families f
WHERE COALESCE(f.divorce_date, '') != ''
   OR COALESCE(f.divorce_place, '') != '';

DROP TABLE events_old;

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
