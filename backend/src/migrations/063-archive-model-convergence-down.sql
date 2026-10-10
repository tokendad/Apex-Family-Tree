-- Reverse 063.
--
-- Only the two reversible parts are undone: the triggers, and the "appears in"
-- relationships this migration derived from person_media. The derived id
-- prefix means nothing a human created by hand is touched.
DROP TRIGGER IF EXISTS events_archive_object_delete;
DROP TRIGGER IF EXISTS persons_archive_object_delete;

-- Deleted child-first, explicitly, rather than by deleting the archive object
-- and letting ON DELETE CASCADE do the rest. Migrations run with
-- PRAGMA foreign_keys = OFF, so cascades do not fire: the first draft of this
-- file deleted only the archive objects and left 92 orphaned relationships and
-- 217 orphaned members behind, which foreign_key_check caught on the rehearsal
-- copy. That is the same class of damage this migration exists to clean up.
DELETE FROM relationship_members
WHERE relationship_id LIKE 'rel_appears_in_media_%';

DELETE FROM relationships
WHERE id LIKE 'rel_appears_in_media_%';

DELETE FROM archive_objects
WHERE object_type = 'relationship'
  AND id LIKE 'rel_appears_in_media_%';

-- Deliberately NOT reversed:
--
--   * The archive_objects rows given to persons and events that lacked one.
--     Every person and event is supposed to have one -- PersonRepository and
--     EventRepository both create them -- so these rows are a repair of a
--     backfill that missed, not a change of shape. Removing them would put the
--     database back into a state the application does not expect, and would
--     orphan anything connected to those people in the meantime.
--
--   * The deleted ghost memberships and orphan person archive objects, for
--     the same reason.
--
--   * The deleted orphan event archive objects. They referred to events that
--     no longer exist and nothing referenced them; there is nothing to restore
--     them from and no reader that wants them back.
