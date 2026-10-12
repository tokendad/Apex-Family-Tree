-- Put the grave plots back into the places table.
--
-- The forward migration rewrote events.event_place, so unlike 070-down this
-- cannot reconstruct itself from the event text. It carries the same reviewed
-- list in reverse, matched on events.plot, which is the one column that still
-- says which plot an event had. The restored places get fixed ids rather than
-- the positional place_backfill_000000NN ones they had.
CREATE TEMP TABLE grave_unfold (id TEXT, title TEXT, normalized_name TEXT, plot TEXT);

INSERT INTO grave_unfold (id, title, normalized_name, plot) VALUES
  ('place_unfold_grave_stjohns_482', 'St. John''s Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, Massachusetts', 'st. john''s cemetery, lot 482 (shrine of the holy family), worcester, massachusetts', 'Lot 482 (Shrine of the Holy Family)'),
  ('place_unfold_grave_wcmp_237', 'Worcester County Memorial Park, Garden of Heritage I, Lot 237 Grave 4, Paxton, Massachusetts', 'worcester county memorial park, garden of heritage i, lot 237 grave 4, paxton, massachusetts', 'Garden of Heritage I, Lot 237 Grave 4'),
  ('place_unfold_grave_wcmp_303a', 'Worcester County Memorial Park, Garden of Heritage I, Lot 303A space 4, Paxton, Massachusetts', 'worcester county memorial park, garden of heritage i, lot 303a space 4, paxton, massachusetts', 'Garden of Heritage I, Lot 303A space 4');

-- Only the rows that are actually missing, so this is safe to re-run.
DELETE FROM grave_unfold
WHERE EXISTS (SELECT 1 FROM places p WHERE p.normalized_name = grave_unfold.normalized_name)
   OR NOT EXISTS (SELECT 1 FROM events e WHERE e.plot = grave_unfold.plot);

INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT id, 'place', title, NULL, 'family', 0, datetime('now'), datetime('now'), NULL, NULL
FROM grave_unfold;

INSERT OR IGNORE INTO places (id, normalized_name, address_text)
SELECT id, normalized_name, title FROM grave_unfold;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT id, title, 'legacy_event_place', 0 FROM grave_unfold;

-- Hand each burial back to its plot, then restore the text it used to carry.
UPDATE OR IGNORE relationship_members
SET object_id = (
  SELECT gu.id FROM grave_unfold gu
  INNER JOIN relationship_members em
    ON em.relationship_id = relationship_members.relationship_id AND em.role = 'event'
  INNER JOIN events e ON e.id = em.object_id AND e.plot = gu.plot
)
WHERE role = 'place'
  AND relationship_id IN (
    SELECT em.relationship_id
    FROM relationship_members em
    INNER JOIN events e ON e.id = em.object_id
    WHERE em.role = 'event' AND e.plot IN (SELECT plot FROM grave_unfold)
  );

UPDATE events
SET event_place = (SELECT gu.title FROM grave_unfold gu WHERE gu.plot = events.plot),
    plot = NULL,
    updated_at = datetime('now')
WHERE plot IN (SELECT plot FROM grave_unfold);

DROP TABLE grave_unfold;
