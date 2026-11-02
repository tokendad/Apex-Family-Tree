-- Issue #31: imported events are absent from the archive_objects relationship
-- graph.
--
-- An event has always had exactly one subject, held in events.person_id or
-- events.family_id and enforced in EventRepository.create. The relationship
-- graph never learned about it, so the Connections tab on an event -- which
-- reads GET /api/v1/relationships/objects/:id/connected -- was empty and its
-- count read 0 for every event, however well connected the record was.
--
-- This mirrors the subject link into the graph, the same way migration 046
-- mirrored events.event_place as an 'occurred_at' edge. events.person_id /
-- events.family_id stay the source of truth; the edge is a derived view of
-- them, kept in step by EventRepository (see syncEventSubject).
--
-- Three steps: give every event an archive object, name the relationship type,
-- then draw one edge per event.

-- 1. Every event needs archive-object identity before it can be an endpoint.
--
-- Migration 046 created these for the events that existed then, but events
-- written by later data migrations with a plain INSERT bypassed
-- EventRepository and so have none. The title repeats 046's mapping so an
-- event backfilled here reads the same as one created through the API.
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
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
      WHEN 'wake' THEN 'Wake'
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
      WHEN 'other' THEN 'Other'
      ELSE 'Event'
    END || COALESCE(' - ' || NULLIF(TRIM(e.event_date), ''), '')
  ),
  e.description,
  'family',
  0,
  COALESCE(e.created_at, datetime('now')),
  COALESCE(e.updated_at, datetime('now')),
  NULL,
  NULL
FROM events e;

-- 2. The relationship type.
--
-- Deliberately not 'associated_with', which is what EventDetailPage's manual
-- "Connect Person" control uses: a person is not merely associated with their
-- own occupation record, they are its subject. A distinct code also makes the
-- derived edges identifiable, which is what lets the down migration remove
-- exactly what was added here.
--
-- is_system = 1 and sort_order 155 puts it beside occurred_at (150), the other
-- event edge.
INSERT OR IGNORE INTO relationship_types (
  id, code, name, inverse_name, category, description,
  is_system, is_directional, is_tree_relevant, default_confidence_id, sort_order
) VALUES (
  'rel_type_event_subject',
  'event_subject',
  'Subject Of Event',
  'Event Of Subject',
  'event',
  'An event belongs to the person or family it was recorded for. Mirrors events.person_id / events.family_id.',
  1, 1, 0, 'confidence_unknown', 155
);

-- The subject role accepts two object types. A person subject is a 'person'
-- archive object; a family subject is the family union, which the tree writes
-- as an archive object of type 'relationship' whose id is the family id (see
-- TreeRepository.syncFamilyUnionFromLegacyFamily). Both rows carry the same
-- role name, which findConnectableTypes merges into one role with two allowed
-- types.
INSERT OR IGNORE INTO relationship_type_roles (
  id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required
) VALUES
  ('rel_role_event_subject_event', 'rel_type_event_subject', 'event', 'event', 1, 1, 10, 1),
  ('rel_role_event_subject_person', 'rel_type_event_subject', 'subject', 'person', 0, 1, 20, 0),
  ('rel_role_event_subject_family', 'rel_type_event_subject', 'subject', 'relationship', 0, 1, 21, 0);

-- 3. One edge per event, id derived from the event id so a second run cannot
-- produce a second edge for the same event.
--
-- Both endpoints must already exist as archive objects. The event side is
-- guaranteed by step 1; the subject side is not. 31 of the family events in
-- the family archive point at families the tree has never written a family
-- union for, and an unguarded insert would leave relationship_members rows
-- referencing nothing -- which fails foreign_key_check in the migration tests
-- and would be invisible breakage in a live database. Those events keep their
-- legacy subject link and gain no edge; writing their family unions is the
-- tree's job, not this migration's.
WITH event_subjects AS (
  SELECT
    e.id AS event_id,
    COALESCE(e.person_id, e.family_id) AS subject_id,
    CASE WHEN e.person_id IS NOT NULL THEN 'person' ELSE 'family' END AS subject_kind
  FROM events e
  WHERE COALESCE(e.person_id, e.family_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = e.id)
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = COALESCE(e.person_id, e.family_id))
)
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT
  'rel_event_subject_' || event_id,
  'relationship',
  'Subject Of Event',
  NULL,
  'family',
  0,
  datetime('now'),
  datetime('now'),
  NULL,
  NULL
FROM event_subjects;

-- No date on the edge: the event owns its date, and a copy here would be one
-- more thing to keep in step on every edit. Migration 046 made the opposite
-- choice for the place edge and EventRepository.syncEventPlace has had to
-- ignore it ever since.
WITH event_subjects AS (
  SELECT
    e.id AS event_id,
    COALESCE(e.person_id, e.family_id) AS subject_id,
    CASE WHEN e.person_id IS NOT NULL THEN 'person' ELSE 'family' END AS subject_kind
  FROM events e
  WHERE COALESCE(e.person_id, e.family_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = e.id)
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = COALESCE(e.person_id, e.family_id))
)
INSERT OR IGNORE INTO relationships (
  id, relationship_type_id, label, description, date_text, date_start, date_end,
  date_precision, date_qualifier, confidence_level_id, confidence_score, notes
)
SELECT
  'rel_event_subject_' || event_id,
  'rel_type_event_subject',
  'Subject Of Event',
  NULL, NULL, NULL, NULL, NULL, NULL,
  'confidence_unknown',
  NULL,
  'Backfilled from events.' || subject_kind || '_id'
FROM event_subjects;

WITH event_subjects AS (
  SELECT
    e.id AS event_id,
    COALESCE(e.person_id, e.family_id) AS subject_id,
    CASE WHEN e.person_id IS NOT NULL THEN 'person' ELSE 'family' END AS subject_kind
  FROM events e
  WHERE COALESCE(e.person_id, e.family_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = e.id)
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = COALESCE(e.person_id, e.family_id))
)
INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_subject_' || event_id, event_id, 'event', 0 FROM event_subjects;

WITH event_subjects AS (
  SELECT
    e.id AS event_id,
    COALESCE(e.person_id, e.family_id) AS subject_id,
    CASE WHEN e.person_id IS NOT NULL THEN 'person' ELSE 'family' END AS subject_kind
  FROM events e
  WHERE COALESCE(e.person_id, e.family_id) IS NOT NULL
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = e.id)
    AND EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = COALESCE(e.person_id, e.family_id))
)
INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_subject_' || event_id, subject_id, 'subject', 1 FROM event_subjects;
