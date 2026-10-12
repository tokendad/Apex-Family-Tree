-- Move the grave plots out of the places table and onto their burials (#35).
--
-- Three of the 72 places were not places. They were a cemetery plus a plot:
--
--   St. John's Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, MA
--   Worcester County Memorial Park, Garden of Heritage I, Lot 237 Grave 4, ...
--   Worcester County Memorial Park, Garden of Heritage I, Lot 303A space 4, ...
--
-- Each one's cemetery already exists as its own place, so the four burials
-- move onto those two rows and the plot text moves to events.plot (071).
-- Places drop from 71 to 68.
--
-- Unlike the "French Canada" fold in 070, this one rewrites events.event_place.
-- That fold was about alternate wording for the same place, so the event kept
-- its own spelling and the old one became an alias. A plot is not another name
-- for the cemetery -- it is a different kind of fact that was stored in the
-- wrong column, so correcting the column is the point. For the same reason no
-- aliases are added: nobody should be able to resolve "Lot 482" to a cemetery.
--
-- A hand-written list, not a rule. Every positional rule tried against this
-- data mistook a cemetery or a hospital for a county (see 068); with three rows
-- a reviewed list is both safer and shorter. Keyed on normalized_name because
-- the place_backfill_000000NN ids came from a ROW_NUMBER() over whatever events
-- existed when 068 ran. Every statement is a no-op where a row is absent, so
-- this does nothing on a fresh install.
CREATE TEMP TABLE grave_fold (from_name TEXT, to_name TEXT, plot TEXT);

INSERT INTO grave_fold (from_name, to_name, plot) VALUES
  ('st. john''s cemetery, lot 482 (shrine of the holy family), worcester, massachusetts', 'st. john''s cemetery, worcester, massachusetts', 'Lot 482 (Shrine of the Holy Family)'),
  ('worcester county memorial park, garden of heritage i, lot 237 grave 4, paxton, massachusetts', 'worcester county memorial park, paxton, massachusetts', 'Garden of Heritage I, Lot 237 Grave 4'),
  ('worcester county memorial park, garden of heritage i, lot 303a space 4, paxton, massachusetts', 'worcester county memorial park, paxton, massachusetts', 'Garden of Heritage I, Lot 303A space 4');

-- Resolve both ends, and carry the cemetery's title as it is actually spelt in
-- this archive rather than repeating it as a literal.
CREATE TEMP TABLE grave_resolved AS
SELECT
  gf.plot          AS plot,
  pf.id            AS from_id,
  pt.id            AS to_id,
  aot.title        AS to_title
FROM grave_fold gf
INNER JOIN places pf ON pf.normalized_name = gf.from_name
INNER JOIN archive_objects aof ON aof.id = pf.id AND aof.is_deleted = 0
INNER JOIN places pt ON pt.normalized_name = gf.to_name
INNER JOIN archive_objects aot ON aot.id = pt.id AND aot.is_deleted = 0
WHERE pf.id <> pt.id;

-- Rewrite the events first. The link from an event to its place is the only
-- way to find them, and the next step is what removes it.
CREATE TEMP TABLE grave_events AS
SELECT
  e.id      AS event_id,
  r.plot    AS plot,
  r.to_title AS to_title
FROM grave_resolved r
INNER JOIN relationship_members pm ON pm.object_id = r.from_id AND pm.role = 'place'
INNER JOIN relationship_members em ON em.relationship_id = pm.relationship_id AND em.role = 'event'
INNER JOIN events e ON e.id = em.object_id;

UPDATE events
SET plot = (SELECT ge.plot FROM grave_events ge WHERE ge.event_id = events.id),
    event_place = (SELECT ge.to_title FROM grave_events ge WHERE ge.event_id = events.id),
    updated_at = datetime('now')
WHERE id IN (SELECT event_id FROM grave_events);

-- Hand the burials to the cemetery. OR IGNORE because relationship_members is
-- UNIQUE on (relationship_id, object_id, role): an event already linked to the
-- cemetery as well keeps the one row it should have, and the duplicate is
-- removed by the deletes below.
UPDATE OR IGNORE relationship_members
SET object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = relationship_members.object_id)
WHERE role = 'place'
  AND object_id IN (SELECT from_id FROM grave_resolved);

UPDATE OR IGNORE collection_items
SET item_object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = collection_items.item_object_id)
WHERE item_object_id IN (SELECT from_id FROM grave_resolved);

UPDATE OR IGNORE object_tags
SET object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = object_tags.object_id)
WHERE object_id IN (SELECT from_id FROM grave_resolved);

UPDATE OR IGNORE claim_subjects
SET subject_object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = claim_subjects.subject_object_id)
WHERE subject_object_id IN (SELECT from_id FROM grave_resolved);

UPDATE OR IGNORE claim_evidence
SET evidence_object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = claim_evidence.evidence_object_id)
WHERE evidence_object_id IN (SELECT from_id FROM grave_resolved);

UPDATE OR IGNORE claims
SET subject_object_id = (SELECT r.to_id FROM grave_resolved r WHERE r.from_id = claims.subject_object_id)
WHERE subject_object_id IN (SELECT from_id FROM grave_resolved);

-- Hard delete, in dependency order by hand: the migrator runs with
-- foreign_keys OFF (db/migrator.ts), so no ON DELETE CASCADE fires here. Soft
-- deleting instead would leave the row holding normalized_name, which is
-- UNIQUE, and a plot masquerading as a place is not worth keeping findable.
DELETE FROM relationship_members WHERE object_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM collection_items WHERE item_object_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM object_tags WHERE object_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM claim_subjects WHERE subject_object_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM claim_evidence WHERE evidence_object_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM place_aliases WHERE place_id IN (SELECT from_id FROM grave_resolved);
DELETE FROM places WHERE id IN (SELECT from_id FROM grave_resolved);
DELETE FROM archive_objects WHERE id IN (SELECT from_id FROM grave_resolved);

DROP TABLE grave_events;
DROP TABLE grave_resolved;
DROP TABLE grave_fold;
