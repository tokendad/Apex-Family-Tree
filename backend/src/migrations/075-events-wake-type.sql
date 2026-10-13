-- Add 'wake' to the events.event_type CHECK constraint.
--
-- A wake is its own gathering: it has a date, a place, and in this archive
-- eighteen photographs of the people who came. Until now the nearest records
-- were the burial, which is the interment and not the evening before it, and
-- 'custom', which renders as the bare word "Event" and carries its meaning
-- only in free text. Neither is the thing that happened.
--
-- Neither GEDCOM 5.5.1 nor 7.0 has a wake tag, so it exports as EVEN with a
-- "2 TYPE Wake" line, which is the substructure both grammars provide for
-- exactly this, and the importer reads that line back.
--
-- Every trigger on the table goes with the DROP, so the one 063 created is
-- recreated at the end of this file. A rebuild that forgets it leaves events
-- deletable without their archive object going too.
--
-- Same rebuild discipline as 062, which added 'anniversary': SQLite cannot
-- alter a CHECK constraint in place, and "events" is never the subject of a
-- RENAME. Renaming it rewrites the foreign keys in other tables' schemas to
-- point at the renamed table, which broke this database twice (031 did it, 037
-- repaired it, 041 did it again, 056 repaired it again). Building events_new
-- and renaming only that leaves source_citations and event_media pointing at
-- "events", which after the rename is once again the right table.
--
-- DROP TABLE events would cascade into those two tables if foreign keys were
-- enforced. They are not: runMigrations sets PRAGMA foreign_keys = OFF before
-- the transaction opens, and restores it afterwards.

CREATE TABLE events_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'death', 'burial', 'wake', 'cremation', 'baptism', 'christening',
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
