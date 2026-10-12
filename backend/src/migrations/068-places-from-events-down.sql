-- Remove only what 068 created, identified by the id prefix it used for places
-- and the marker it wrote on the relationships. A place someone has since
-- edited by hand keeps its row; an edge the application created for a new event
-- carries no marker and is left alone.

DELETE FROM relationship_members
WHERE relationship_id IN (SELECT id FROM relationships WHERE notes = 'Backfilled by migration 068');

-- Before the relationships rows, while they can still be selected.
DELETE FROM archive_objects
WHERE id IN (SELECT id FROM relationships WHERE notes = 'Backfilled by migration 068');

DELETE FROM relationships WHERE notes = 'Backfilled by migration 068';

DELETE FROM relationship_members WHERE object_id LIKE 'place_backfill_%';
DELETE FROM place_aliases WHERE place_id LIKE 'place_backfill_%';
DELETE FROM places WHERE id LIKE 'place_backfill_%';
DELETE FROM archive_objects WHERE id LIKE 'place_backfill_%' AND object_type = 'place';
