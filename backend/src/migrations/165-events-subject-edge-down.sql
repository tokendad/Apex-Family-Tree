-- Rollback for 165-events-subject-edge.sql.
--
-- Removes the derived subject edges and the relationship type that names them.
-- Nothing is lost: events.person_id / events.family_id remain the source of
-- truth, and 165 only ever copied them.
--
-- Deliberately asymmetric in one place. The archive_objects rows that step 1
-- created for events that had none are left behind, because an event is
-- supposed to have archive-object identity -- migration 046 established that,
-- and the rows 165 added were repairing events that bypassed it. Deleting them
-- here would remove identity that other edges, media links and collections may
-- by then point at, to undo something that was never the edge's doing.
--
-- Explicit deletes in dependency order. ON DELETE CASCADE only fires when the
-- connection has foreign_keys on, which the migrator turns off for the whole
-- run and an in-memory test database never turns on.

DELETE FROM relationship_members
WHERE relationship_id LIKE 'rel_event_subject_%';

DELETE FROM relationships
WHERE id LIKE 'rel_event_subject_%';

DELETE FROM archive_objects
WHERE id LIKE 'rel_event_subject_%'
  AND object_type = 'relationship';

DELETE FROM relationship_type_roles
WHERE relationship_type_id = 'rel_type_event_subject';

DELETE FROM relationship_types
WHERE id = 'rel_type_event_subject';
