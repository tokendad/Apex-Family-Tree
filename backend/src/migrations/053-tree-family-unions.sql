-- Phase 11: backfill legacy family rows into tree-relevant family_union relationships.

INSERT OR IGNORE INTO archive_objects (
  id,
  object_type,
  title,
  summary,
  privacy_level,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  f.id,
  'relationship',
  'Family Union',
  NULL,
  'family',
  0,
  COALESCE(f.created_at, datetime('now')),
  COALESCE(f.updated_at, datetime('now'))
FROM families f;

INSERT OR IGNORE INTO relationships (
  id,
  relationship_type_id,
  label,
  date_text,
  notes
)
SELECT
  f.id,
  'rel_type_family_union',
  'Family Union',
  f.marriage_date,
  'Backfilled from legacy family record.'
FROM families f
WHERE EXISTS (SELECT 1 FROM relationship_types WHERE id = 'rel_type_family_union');

INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT
  'tree_' || f.id || '_partner_1',
  f.id,
  f.spouse1_id,
  'partner',
  0
FROM families f
WHERE f.spouse1_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM relationships r WHERE r.id = f.id);

INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT
  'tree_' || f.id || '_partner_2',
  f.id,
  f.spouse2_id,
  'partner',
  1
FROM families f
WHERE f.spouse2_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM relationships r WHERE r.id = f.id);

INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order, notes)
SELECT
  'tree_' || fm.family_id || '_child_' || fm.person_id,
  fm.family_id,
  fm.person_id,
  'child',
  COALESCE(fm.sort_order, 0),
  CASE WHEN fm.role IS NOT NULL AND fm.role != 'child' THEN 'legacy_child_role:' || fm.role ELSE NULL END
FROM family_members fm
WHERE EXISTS (SELECT 1 FROM relationships r WHERE r.id = fm.family_id);
