-- Add 'anniversary' to the events.event_type CHECK constraint.
--
-- A wedding anniversary is a dated occurrence belonging to a couple, not to
-- either spouse alone, so it is a family event alongside marriage, divorce and
-- engagement. Until now the only way to record one was event_type 'other',
-- which renders as the bare word "Event" in every timeline and carries its
-- meaning solely in the free-text description.
--
-- WHY THIS FILE DOES NOT USE "ALTER TABLE events RENAME TO events_old":
--
-- SQLite cannot alter a CHECK constraint in place, so the table has to be
-- rebuilt. The obvious rebuild -- rename the original aside, create the
-- replacement, copy, drop the original -- has already broken this database
-- twice. With legacy_alter_table off (the default), ALTER TABLE ... RENAME
-- rewrites references to the renamed table in *other* tables' schemas, so
-- renaming "events" to "events_old" silently rewrote the foreign keys in
-- source_citations and event_media to point at "events_old". Dropping
-- events_old then left both pointing at a table that no longer exists, and any
-- DELETE cascading into events failed with "no such table: main.events_old".
-- 031 did it, 037 repaired it, 041 did it again, 056 repaired it again.
--
-- This migration instead builds events_new, copies into it, drops the original
-- and renames the replacement into place. "events" is never the subject of a
-- RENAME, so no other table's foreign keys are touched: they still say
-- REFERENCES events(id), and after the rename that is once again the right
-- table. The only RENAME is events_new -> events, and nothing references
-- events_new.
--
-- DROP TABLE events would cascade into source_citations (214 rows carry an
-- event_id) and event_media (84 rows) if foreign keys were enforced. They are
-- not: runMigrations sets PRAGMA foreign_keys = OFF before the transaction
-- opens -- the pragma is a no-op inside one -- and restores it afterwards.

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
  description TEXT,
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

-- All four indexes the live table carries. 039 recreated only three because
-- idx_events_family did not exist until 041 added family_id.
CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date_sort ON events(event_date_sort_key);
