-- Unfold "French Canada" back out of Canada.
--
-- The fold is recoverable because it never rewrote events.event_place: the
-- event still says 'French Canada', so the row can be rebuilt from the event
-- and re-linked. The restored place gets a fixed id rather than the
-- place_backfill_000000NN one it had, which was positional and is not
-- reconstructible.
CREATE TEMP TABLE place_unfold AS
SELECT
  (SELECT p.id FROM places p
     INNER JOIN archive_objects ao ON ao.id = p.id
     WHERE p.normalized_name = 'canada' AND ao.is_deleted = 0) AS canada_id
WHERE EXISTS (
  SELECT 1 FROM place_aliases pa
  WHERE LOWER(TRIM(pa.alias)) = 'french canada'
)
AND NOT EXISTS (
  SELECT 1 FROM places p WHERE p.normalized_name = 'french canada'
);

DELETE FROM place_unfold WHERE canada_id IS NULL;

INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT 'place_unfold_french_canada', 'place', 'French Canada', NULL, 'family', 0,
       datetime('now'), datetime('now'), NULL, NULL
FROM place_unfold;

INSERT OR IGNORE INTO places (id, normalized_name, address_text)
SELECT 'place_unfold_french_canada', 'french canada', 'French Canada'
FROM place_unfold;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT 'place_unfold_french_canada', 'French Canada', 'legacy_event_place', 0
FROM place_unfold;

-- Hand the events that still name it back to it.
UPDATE OR IGNORE relationship_members
SET object_id = 'place_unfold_french_canada'
WHERE role = 'place'
  AND object_id IN (SELECT canada_id FROM place_unfold)
  AND relationship_id IN (
    SELECT rm.relationship_id
    FROM relationship_members rm
    INNER JOIN events e ON e.id = rm.object_id
    WHERE rm.role = 'event'
      AND LOWER(TRIM(COALESCE(e.event_place, ''))) = 'french canada'
  );

DELETE FROM place_aliases
WHERE place_id IN (SELECT canada_id FROM place_unfold)
  AND LOWER(TRIM(alias)) = 'french canada';

DROP TABLE place_unfold;
