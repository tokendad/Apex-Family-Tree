-- Fold the "French Canada" place into Canada (#35).
--
-- Split from 069 so it stays pure data: 069 is DDL and can only ever run once,
-- while this file is idempotent and can be re-executed against a test fixture
-- to prove the fold does what it claims.
--
-- "French Canada" is not a place. It is how one source described an origin, and
-- it reached the places table because 068 made a place out of every distinct
-- event_place string. Folded into Canada, which already exists with its own
-- event, and kept as an alias so the source's wording is not lost -- that is
-- what resolveOrCreate's alias leg is for, and it means the event keeps
-- event_place = 'French Canada' while resolving to the Canada row.
--
-- Written against normalized_name, never against the place_backfill_000000NN
-- ids: those came from a ROW_NUMBER() over whatever events existed when 068
-- ran, so they differ between this archive, a fresh install and the test
-- fixtures. Every statement below is a no-op when either row is absent.
CREATE TEMP TABLE place_fold AS
SELECT
  (SELECT p.id FROM places p
     INNER JOIN archive_objects ao ON ao.id = p.id
     WHERE p.normalized_name = 'french canada' AND ao.is_deleted = 0) AS from_id,
  (SELECT p.id FROM places p
     INNER JOIN archive_objects ao ON ao.id = p.id
     WHERE p.normalized_name = 'canada' AND ao.is_deleted = 0) AS to_id;

DELETE FROM place_fold WHERE from_id IS NULL OR to_id IS NULL OR from_id = to_id;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT
  f.to_id,
  ao.title,
  'legacy_event_place',
  COALESCE((SELECT MAX(pa.sort_order) FROM place_aliases pa WHERE pa.place_id = f.to_id), 0) + 1
FROM place_fold f
INNER JOIN archive_objects ao ON ao.id = f.from_id;

-- Re-point every reference before the row goes. OR IGNORE because each of
-- these tables is UNIQUE on (parent, object): where Canada is already the
-- other member of the same row, the duplicate is dropped rather than failing
-- the migration, and the leftover goes with the deletes below.
UPDATE OR IGNORE relationship_members
SET object_id = (SELECT to_id FROM place_fold)
WHERE object_id = (SELECT from_id FROM place_fold);

UPDATE OR IGNORE collection_items
SET item_object_id = (SELECT to_id FROM place_fold)
WHERE item_object_id = (SELECT from_id FROM place_fold);

UPDATE OR IGNORE object_tags
SET object_id = (SELECT to_id FROM place_fold)
WHERE object_id = (SELECT from_id FROM place_fold);

UPDATE OR IGNORE claim_subjects
SET subject_object_id = (SELECT to_id FROM place_fold)
WHERE subject_object_id = (SELECT from_id FROM place_fold);

UPDATE OR IGNORE claim_evidence
SET evidence_object_id = (SELECT to_id FROM place_fold)
WHERE evidence_object_id = (SELECT from_id FROM place_fold);

UPDATE OR IGNORE claims
SET subject_object_id = (SELECT to_id FROM place_fold)
WHERE subject_object_id = (SELECT from_id FROM place_fold);

-- Hard delete, and in dependency order by hand.
--
-- Hard rather than soft because a soft-deleted row keeps holding
-- normalized_name = 'french canada', which is UNIQUE: the name could then
-- never be created again, and the orphaned row is exactly the soft-delete
-- problem #43 is open about. The rows that survive the fold are the alias and
-- the event, which is everything the string meant.
--
-- By hand because the migrator turns foreign_keys OFF for the whole run
-- (db/migrator.ts), so none of the ON DELETE CASCADE clauses fire here.
DELETE FROM relationship_members WHERE object_id IN (SELECT from_id FROM place_fold);
DELETE FROM collection_items WHERE item_object_id IN (SELECT from_id FROM place_fold);
DELETE FROM object_tags WHERE object_id IN (SELECT from_id FROM place_fold);
DELETE FROM claim_subjects WHERE subject_object_id IN (SELECT from_id FROM place_fold);
DELETE FROM claim_evidence WHERE evidence_object_id IN (SELECT from_id FROM place_fold);
DELETE FROM place_aliases WHERE place_id IN (SELECT from_id FROM place_fold);
DELETE FROM places WHERE id IN (SELECT from_id FROM place_fold);
DELETE FROM archive_objects WHERE id IN (SELECT from_id FROM place_fold);

DROP TABLE place_fold;
