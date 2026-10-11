-- Converge the archive model with the legacy tables it was bridged from.
--
-- The archive model (archive_objects + relationships) was introduced by a
-- series of one-off backfills: 045 bridged media to artifacts, 052 gave every
-- person an archive_objects row, 046 did the same for events. Each ran once,
-- against the data that existed at the time. Rows created afterwards were only
-- partly carried across, and the drift is now visible in the UI: a person page
-- shows "0 Artifacts" on the summary card beside an "Artifacts (8)" tab,
-- because the card counts archive-model connections and the tab falls back to
-- the legacy person_media links.
--
-- This migration closes four gaps and adds a trigger so the largest of them
-- cannot reopen.

-- ── 1. Persons with no archive_objects row ───────────────────────────────────
--
-- PersonRepository.create has always created one. These twelve came in through
-- ad-hoc SQL import helpers that wrote to persons directly, so they were never
-- given an archive identity -- which also means they cannot be a member of any
-- relationship, since relationship_members.object_id references
-- archive_objects(id). They must exist before section 3 can reference them.
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted,
  created_at, updated_at, created_by, updated_by
)
SELECT
  p.id,
  'person',
  COALESCE(NULLIF(TRIM(p.display_name), ''), 'Unknown Person'),
  NULLIF(TRIM(p.notes), ''),
  CASE WHEN COALESCE(p.is_private, 0) = 1 THEN 'private' ELSE 'family' END,
  0,
  COALESCE(p.created_at, datetime('now')),
  COALESCE(p.updated_at, datetime('now')),
  p.created_by,
  p.created_by
FROM persons p
WHERE NOT EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = p.id);

-- ── 2. Events with no archive_objects row ────────────────────────────────────
--
-- Same cause: 046 backfilled the events that existed then. The label CASE is
-- 046's, extended with the anniversary type added in 062 -- without that line a
-- golden wedding would be titled "Event", which is the very thing 062 fixed.
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted,
  created_at, updated_at, created_by, updated_by
)
SELECT
  e.id,
  'event',
  TRIM(
    CASE e.event_type
      WHEN 'birth' THEN 'Birth'
      WHEN 'death' THEN 'Death'
      WHEN 'burial' THEN 'Burial'
      WHEN 'cremation' THEN 'Cremation'
      WHEN 'baptism' THEN 'Baptism'
      WHEN 'christening' THEN 'Christening'
      WHEN 'bar_mitzvah' THEN 'Bar Mitzvah'
      WHEN 'bat_mitzvah' THEN 'Bat Mitzvah'
      WHEN 'confirmation' THEN 'Confirmation'
      WHEN 'first_communion' THEN 'First Communion'
      WHEN 'graduation' THEN 'Graduation'
      WHEN 'immigration' THEN 'Immigration'
      WHEN 'emigration' THEN 'Emigration'
      WHEN 'naturalization' THEN 'Naturalization'
      WHEN 'census' THEN 'Census'
      WHEN 'residence' THEN 'Residence'
      WHEN 'occupation' THEN 'Occupation'
      WHEN 'retirement' THEN 'Retirement'
      WHEN 'military_service' THEN 'Military Service'
      WHEN 'medical' THEN 'Medical'
      WHEN 'probate' THEN 'Probate'
      WHEN 'will' THEN 'Will'
      WHEN 'education' THEN 'Education'
      WHEN 'religion' THEN 'Religion'
      WHEN 'ssn' THEN 'SSN'
      WHEN 'title' THEN 'Title'
      WHEN 'marriage' THEN 'Marriage'
      WHEN 'divorce' THEN 'Divorce'
      WHEN 'annulment' THEN 'Annulment'
      WHEN 'anniversary' THEN 'Anniversary'
      ELSE 'Event'
    END || COALESCE(' - ' || NULLIF(TRIM(e.event_date), ''), '')
  ),
  NULLIF(TRIM(e.description), ''),
  'family',
  0,
  COALESCE(e.created_at, datetime('now')),
  COALESCE(e.updated_at, datetime('now')),
  NULL,
  NULL
FROM events e
WHERE NOT EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = e.id);

-- ── 3. person_media -> "appears in" relationships ────────────────────────────
--
-- One relationship per media item, not per link: the appears_in contract allows
-- exactly one artifact and any number of subjects, so a class photograph of
-- five people is one relationship with five subjects rather than five
-- relationships. See relationship_type_roles for rel_type_appears_in.
--
-- Ids are derived from the media id rather than random, so the guards below
-- make this re-runnable and so a human reading relationship_members can see
-- where a row came from.
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted,
  created_at, updated_at, created_by, updated_by
)
SELECT DISTINCT
  'rel_appears_in_media_' || pm.media_id,
  'relationship',
  'Appears In',
  NULL,
  'family',
  0,
  datetime('now'),
  datetime('now'),
  NULL,
  NULL
FROM person_media pm
WHERE NOT EXISTS (
  SELECT 1 FROM archive_objects ao WHERE ao.id = 'rel_appears_in_media_' || pm.media_id
);

INSERT OR IGNORE INTO relationships (id, relationship_type_id, label, description, notes)
SELECT DISTINCT
  'rel_appears_in_media_' || pm.media_id,
  'rel_type_appears_in',
  NULL,
  NULL,
  NULL
FROM person_media pm
INNER JOIN archive_objects ao ON ao.id = 'rel_appears_in_media_' || pm.media_id
WHERE NOT EXISTS (
  SELECT 1 FROM relationships r WHERE r.id = 'rel_appears_in_media_' || pm.media_id
);

-- The artifact member: exactly one per relationship, role 'artifact'.
INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT DISTINCT
  'relm_artifact_' || pm.media_id,
  'rel_appears_in_media_' || pm.media_id,
  pm.media_id,
  'artifact',
  0
FROM person_media pm
INNER JOIN relationships r ON r.id = 'rel_appears_in_media_' || pm.media_id
-- Only where the media actually has an artifact identity, so no member can
-- reference an archive object that does not exist.
INNER JOIN artifacts a ON a.id = pm.media_id
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_members rm
  WHERE rm.relationship_id = 'rel_appears_in_media_' || pm.media_id
    AND rm.object_id = pm.media_id
    AND rm.role = 'artifact'
);

-- The subject members: every person the media is linked to. The INNER JOIN on
-- archive_objects is the guard that matters -- section 1 has just given the
-- last twelve people an identity, and anyone still missing one is skipped
-- rather than written as a dangling member.
INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT
  'relm_subject_' || pm.media_id || '_' || pm.person_id,
  'rel_appears_in_media_' || pm.media_id,
  pm.person_id,
  'subject',
  pm.sort_order
FROM person_media pm
INNER JOIN relationships r ON r.id = 'rel_appears_in_media_' || pm.media_id
INNER JOIN archive_objects pao ON pao.id = pm.person_id AND pao.object_type = 'person'
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_members rm
  WHERE rm.relationship_id = 'rel_appears_in_media_' || pm.media_id
    AND rm.object_id = pm.person_id
    AND rm.role = 'subject'
);

-- ── 4. Orphaned event archive objects ────────────────────────────────────────
--
-- There is no foreign key between events and archive_objects, so deleting a
-- person cascades into events and leaves their archive objects behind. 272 had
-- accumulated against 269 live events. None is referenced by any relationship
-- member, so removing them is safe.
DELETE FROM archive_objects
WHERE object_type = 'event'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = archive_objects.id);

-- ── 5. Stop section 4 from recurring ─────────────────────────────────────────
--
-- EventRepository.delete already removes the archive object, but a person
-- delete reaches events through an ON DELETE CASCADE that the repository never
-- sees. A trigger is the only thing on every path, and this schema already
-- uses them for exactly this kind of cleanup (023, 026, 029, 033).
--
-- The relationship is dropped whole rather than just the event's membership in
-- it: a relationship that exists to say something about an event -- a photo
-- that depicts it, a place it occurred at -- has no meaning once the event is
-- gone, and a half-emptied relationship is the sort of state that produced the
-- drift this migration is cleaning up. Deleting the relationship's archive
-- object cascades to relationships and to its remaining members.
DROP TRIGGER IF EXISTS events_archive_object_delete;
CREATE TRIGGER events_archive_object_delete AFTER DELETE ON events
BEGIN
  DELETE FROM archive_objects
  WHERE id IN (
    SELECT rm.relationship_id FROM relationship_members rm WHERE rm.object_id = OLD.id
  );

  DELETE FROM archive_objects WHERE id = OLD.id AND object_type = 'event';
END;

-- ── 6. Ghost person memberships and orphaned person archive objects ──────────
--
-- One of these existed: "Alta Lefort", still listed as a child of Gustave and
-- Mabel's union although the person had been deleted. The cause is
-- personDedup, which deletes the duplicate's persons row directly and never
-- touches archive_objects or relationship_members -- there is no foreign key
-- from relationship_members to persons, only to archive_objects, so the
-- membership survived its subject.
--
-- Unlike section 5, only the membership is removed, not the relationship. A
-- family union is not *about* its members the way a "depicts" relationship is
-- about its event: Gustave and Mabel's union is real and has seven other
-- children, so dropping it to remove one ghost would be the destructive
-- reading. The member row goes; the union stays.
--
-- Members are deleted before the archive objects they point at, which is the
-- order the foreign key wants even though the migrator runs with it disabled.
DELETE FROM relationship_members
WHERE object_id IN (
  SELECT ao.id FROM archive_objects ao
  WHERE ao.object_type = 'person'
    AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = ao.id)
);

DELETE FROM archive_objects
WHERE object_type = 'person'
  AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = archive_objects.id);

-- ── 7. Stop section 6 from recurring ─────────────────────────────────────────
--
-- The same argument as section 5: PersonRepository.delete removes the archive
-- object, but personDedup and any direct DELETE do not. A trigger covers every
-- path. personDedup is additionally changed to re-point a duplicate's
-- memberships onto the surviving person before deleting it, so a merge
-- inherits them rather than relying on this trigger to sweep them away.
DROP TRIGGER IF EXISTS persons_archive_object_delete;
CREATE TRIGGER persons_archive_object_delete AFTER DELETE ON persons
BEGIN
  DELETE FROM relationship_members WHERE object_id = OLD.id;
  DELETE FROM archive_objects WHERE id = OLD.id AND object_type = 'person';
END;
