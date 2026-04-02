-- Life events for persons
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'death', 'burial', 'cremation', 'baptism', 'christening',
    'bar_mitzvah', 'bat_mitzvah', 'confirmation', 'first_communion',
    'graduation', 'immigration', 'emigration', 'naturalization',
    'census', 'residence', 'occupation', 'retirement',
    'military_service', 'medical', 'custom'
  )),
  event_date TEXT,
  event_date_qualifier TEXT CHECK (event_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  event_date_sort_key INTEGER,
  event_place TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
