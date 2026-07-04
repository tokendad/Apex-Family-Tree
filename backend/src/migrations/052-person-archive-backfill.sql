-- Backfill archive_objects rows for any person created after migration 042's
-- one-time backfill but before PersonRepository started writing through to
-- archive_objects on create. Without this, those persons can be selected in
-- the UI but relationship validation rejects them with "object not found"
-- (see RelationshipService.validateMembers), and any relationship-connected
-- view (Connect Person, story/artifact "Connected To" panels) can't resolve
-- them at all.
--
-- INSERT OR IGNORE means this is safe to run against any database: persons
-- that already have an archive_objects row (including everyone covered by
-- migration 042's original backfill) are left untouched.

INSERT OR IGNORE INTO archive_objects (
  id,
  object_type,
  title,
  summary,
  privacy_level,
  is_deleted,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  p.id,
  'person',
  COALESCE(
    NULLIF(TRIM(p.display_name), ''),
    NULLIF(TRIM(
      COALESCE(n.prefix || ' ', '') ||
      COALESCE(n.given_name || ' ', '') ||
      COALESCE(n.middle_name || ' ', '') ||
      COALESCE(n.surname || ' ', '') ||
      COALESCE(n.suffix, '')
    ), ''),
    'Unknown Person'
  ) AS title,
  p.notes,
  CASE WHEN p.is_private = 1 THEN 'private' ELSE 'family' END,
  0,
  COALESCE(p.created_at, datetime('now')),
  COALESCE(p.updated_at, datetime('now')),
  p.created_by,
  NULL
FROM persons p
LEFT JOIN names n ON n.id = (
  SELECT n2.id
  FROM names n2
  WHERE n2.person_id = p.id
  ORDER BY n2.is_primary DESC, n2.sort_order ASC, n2.created_at ASC, n2.id ASC
  LIMIT 1
);
