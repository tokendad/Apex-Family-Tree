-- Reverse 075: drop 'wake' from the events.event_type CHECK constraint.
--
-- Any wake already recorded is demoted to 'custom' FIRST. Without that the
-- INSERT below would fail the new table's own CHECK and abort the
-- transaction -- and on a rollback, run precisely because something has gone
-- wrong, failing is the worst available outcome. Demoting loses the type but
-- keeps the row, its date, its place and the photographs linked to it.
UPDATE events SET event_type = 'custom' WHERE event_type = 'wake';

-- Every trigger on the table goes with the DROP, so the one 063 created is
-- recreated at the end of this file. A rebuild that forgets it leaves events
-- deletable without their archive object going too.
--
-- Same rebuild discipline as the up migration: events is never renamed, so
-- the foreign keys in source_citations and event_media are left pointing at
-- "events" rather than at a table that is about to disappear. See
-- 075-events-wake-type.sql for the history of that bug.

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
    'marriage', 'divorce', 'annulment', 'engagement', 'anniversary',
    'marriage_bann', 'marriage_contract', 'marriage_license',
    'marriage_settlement'
  )),
  event_date TEXT,
  event_date_qualifier TEXT CHECK (event_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  event_date_sort_key INTEGER,
  event_place TEXT,
  plot TEXT,
  description TEXT,
  source_url TEXT,
  source_url_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (person_id IS NOT NULL AND family_id IS NULL)
    OR
    (person_id IS NULL AND family_id IS NOT NULL)
  )
);

-- Columns named explicitly rather than SELECT *, so a future column added to
-- one table and not the other fails loudly instead of shifting values sideways.
-- plot, source_url and source_url_checked_at were added by 067 and 071 after
-- the last rebuild, and sit in their declared order here rather than at the end.
INSERT INTO events_new (
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, plot, description, source_url,
  source_url_checked_at, created_at, updated_at
)
SELECT
  id, person_id, family_id, event_type, event_date, event_date_qualifier,
  event_date_sort_key, event_place, plot, description, source_url,
  source_url_checked_at, created_at, updated_at
FROM events;

DROP TABLE events;

ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);

-- DROP TABLE takes every trigger on the table with it, and the rebuild has to
-- put them back. 062 did not have to: 063 created this one afterwards, and
-- 075 is the first rebuild since. Without it, deleting an event leaves its
-- archive object and the relationships that pointed at it behind -- the exact
-- drift 063 was written to clean up, reintroduced silently by a migration
-- about an event type. Copied verbatim from 063.
DROP TRIGGER IF EXISTS events_archive_object_delete;
CREATE TRIGGER events_archive_object_delete AFTER DELETE ON events
BEGIN
  DELETE FROM archive_objects
  WHERE id IN (
    SELECT rm.relationship_id FROM relationship_members rm WHERE rm.object_id = OLD.id
  );

  DELETE FROM archive_objects WHERE id = OLD.id AND object_type = 'event';
END;
