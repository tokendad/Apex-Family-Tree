-- Apex Family Legacy 2.0 archive foundation.
-- Adds the shared archive identity layer and system lookup contracts without
-- replacing existing person, family, media, source, or event tables.

CREATE TABLE IF NOT EXISTS archive_objects (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN (
    'person',
    'artifact',
    'event',
    'place',
    'story',
    'collection',
    'claim',
    'relationship'
  )),
  title TEXT NOT NULL,
  summary TEXT,
  privacy_level TEXT NOT NULL DEFAULT 'family' CHECK (privacy_level IN (
    'public',
    'family',
    'private',
    'restricted'
  )),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS artifact_types (
  id TEXT PRIMARY KEY,
  parent_type_id TEXT REFERENCES artifact_types(id),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS evidence_classifications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_weight INTEGER CHECK (default_weight IS NULL OR default_weight BETWEEN 0 AND 100),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS confidence_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  numeric_value INTEGER CHECK (numeric_value IS NULL OR numeric_value BETWEEN 0 AND 100),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relationship_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  inverse_name TEXT,
  category TEXT,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_directional INTEGER NOT NULL DEFAULT 1 CHECK (is_directional IN (0, 1)),
  is_tree_relevant INTEGER NOT NULL DEFAULT 0 CHECK (is_tree_relevant IN (0, 1)),
  default_confidence_id TEXT REFERENCES confidence_levels(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relationship_type_roles (
  id TEXT PRIMARY KEY,
  relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  allowed_object_type TEXT NOT NULL CHECK (allowed_object_type IN (
    'person',
    'artifact',
    'event',
    'place',
    'story',
    'collection',
    'claim',
    'relationship'
  )),
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER CHECK (max_count IS NULL OR max_count >= min_count),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  UNIQUE (relationship_type_id, role, allowed_object_type)
);

CREATE INDEX IF NOT EXISTS idx_archive_objects_type ON archive_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_archive_objects_updated ON archive_objects(updated_at);
CREATE INDEX IF NOT EXISTS idx_archive_objects_privacy ON archive_objects(privacy_level);
CREATE INDEX IF NOT EXISTS idx_archive_objects_deleted ON archive_objects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_artifact_types_parent ON artifact_types(parent_type_id);
CREATE INDEX IF NOT EXISTS idx_relationship_types_code ON relationship_types(code);
CREATE INDEX IF NOT EXISTS idx_relationship_type_roles_type ON relationship_type_roles(relationship_type_id);

INSERT OR IGNORE INTO artifact_types (id, name, description, icon, is_system, sort_order) VALUES
  ('artifact_type_photo', 'Photo', 'Photograph or image preserved by the family archive.', 'image', 1, 10),
  ('artifact_type_letter', 'Letter', 'Personal, formal, or historical correspondence.', 'mail', 1, 20),
  ('artifact_type_document', 'Document', 'Paper or digital document.', 'file-text', 1, 30),
  ('artifact_type_recipe', 'Recipe', 'Family recipe or food tradition.', 'utensils', 1, 40),
  ('artifact_type_audio_recording', 'Audio Recording', 'Audio recording or oral history.', 'audio-lines', 1, 50),
  ('artifact_type_video', 'Video', 'Video recording or home movie.', 'video', 1, 60),
  ('artifact_type_physical_object', 'Physical Object', 'Physical keepsake or heirloom.', 'package', 1, 70),
  ('artifact_type_map', 'Map', 'Map or geographic record.', 'map', 1, 80),
  ('artifact_type_book', 'Book', 'Book, booklet, or bound volume.', 'book-open', 1, 90),
  ('artifact_type_newspaper', 'Newspaper', 'Newspaper issue or clipping.', 'newspaper', 1, 100),
  ('artifact_type_scrapbook_page', 'Scrapbook Page', 'Scrapbook page or collage.', 'images', 1, 110),
  ('artifact_type_certificate', 'Certificate', 'Certificate, award, or official paper.', 'badge-check', 1, 120);

INSERT OR IGNORE INTO evidence_classifications (id, name, description, default_weight, is_system, sort_order) VALUES
  ('evidence_official_record', 'Official Record', 'Record created by an official institution or authority.', 90, 1, 10),
  ('evidence_primary_source', 'Primary Source', 'Evidence created close to the event or by a direct participant.', 85, 1, 20),
  ('evidence_secondary_source', 'Secondary Source', 'Evidence derived from analysis, retelling, or later compilation.', 60, 1, 30),
  ('evidence_supporting_evidence', 'Supporting Evidence', 'Evidence that supports context but may not be conclusive.', 50, 1, 40),
  ('evidence_personal_artifact', 'Personal Artifact', 'Family artifact with historical or memory value.', 45, 1, 50),
  ('evidence_family_memory', 'Family Memory', 'Oral history, recollection, or family tradition.', 35, 1, 60),
  ('evidence_reproduction_copy', 'Reproduction / Copy', 'Copy or reproduction of another artifact or record.', 30, 1, 70),
  ('evidence_unknown', 'Unknown', 'Evidence classification has not been determined.', NULL, 1, 80);

INSERT OR IGNORE INTO confidence_levels (id, name, description, numeric_value, is_system, sort_order) VALUES
  ('confidence_unknown', 'Unknown', 'Confidence has not been assessed.', NULL, 1, 10),
  ('confidence_possible', 'Possible', 'Supported by limited or uncertain information.', 25, 1, 20),
  ('confidence_probable', 'Probable', 'Supported by credible but incomplete evidence.', 65, 1, 30),
  ('confidence_confirmed', 'Confirmed', 'Supported by strong evidence.', 95, 1, 40),
  ('confidence_disputed', 'Disputed', 'There is meaningful disagreement or conflicting evidence.', 40, 1, 50),
  ('confidence_rejected', 'Rejected', 'Evidence indicates this should not be accepted as true.', 0, 1, 60);

INSERT OR IGNORE INTO relationship_types (
  id, code, name, inverse_name, category, description, is_system, is_directional, is_tree_relevant, default_confidence_id, sort_order
) VALUES
  ('rel_type_biological_parent_of', 'biological_parent_of', 'Biological Parent Of', 'Biological Child Of', 'genealogy', 'Biological parent-child relationship. Pairwise display may be derived from family unions during tree migration.', 1, 1, 0, 'confidence_unknown', 10),
  ('rel_type_adoptive_parent_of', 'adoptive_parent_of', 'Adoptive Parent Of', 'Adoptive Child Of', 'genealogy', 'Adoptive parent-child relationship.', 1, 1, 0, 'confidence_unknown', 20),
  ('rel_type_foster_parent_of', 'foster_parent_of', 'Foster Parent Of', 'Foster Child Of', 'genealogy', 'Foster parent-child relationship.', 1, 1, 0, 'confidence_unknown', 30),
  ('rel_type_step_parent_of', 'step_parent_of', 'Step Parent Of', 'Step Child Of', 'genealogy', 'Step parent-child relationship.', 1, 1, 0, 'confidence_unknown', 40),
  ('rel_type_guardian_of', 'guardian_of', 'Guardian Of', 'Ward Of', 'genealogy', 'Guardian or caretaker relationship.', 1, 1, 0, 'confidence_unknown', 50),
  ('rel_type_sibling_of', 'sibling_of', 'Sibling Of', 'Sibling Of', 'genealogy', 'Sibling relationship.', 1, 0, 0, 'confidence_unknown', 60),
  ('rel_type_family_union', 'family_union', 'Family Union', NULL, 'genealogy', 'Canonical stored relationship for tree family structure with partner and child members.', 1, 0, 1, 'confidence_unknown', 70),
  ('rel_type_child_in_union', 'child_in_union', 'Child In Union', NULL, 'genealogy', 'Derived or compatibility label for a child belonging to a family union.', 1, 1, 0, 'confidence_unknown', 80),
  ('rel_type_appears_in', 'appears_in', 'Appears In', 'Includes Subject', 'artifact', 'A person appears in an artifact such as a photo or video.', 1, 1, 0, 'confidence_unknown', 90),
  ('rel_type_created_by', 'created_by', 'Created By', 'Creator Of', 'artifact', 'An artifact, story, or object was created by a person or organization represented in the archive.', 1, 1, 0, 'confidence_unknown', 100),
  ('rel_type_owned_by', 'owned_by', 'Owned By', 'Owner Of', 'artifact', 'An object was owned by a person.', 1, 1, 0, 'confidence_unknown', 110),
  ('rel_type_donated_by', 'donated_by', 'Donated By', 'Donor Of', 'artifact', 'An object was donated by a person.', 1, 1, 0, 'confidence_unknown', 120),
  ('rel_type_scanned_by', 'scanned_by', 'Scanned By', 'Scanner Of', 'artifact', 'An artifact was scanned or digitized by a person.', 1, 1, 0, 'confidence_unknown', 130),
  ('rel_type_identified_by', 'identified_by', 'Identified By', 'Identifier Of', 'provenance', 'An object or subject was identified by a person.', 1, 1, 0, 'confidence_unknown', 140),
  ('rel_type_occurred_at', 'occurred_at', 'Occurred At', 'Location Of Event', 'event', 'An event occurred at a place.', 1, 1, 0, 'confidence_unknown', 150),
  ('rel_type_depicts_event', 'depicts_event', 'Depicts Event', 'Depicted By', 'event', 'An artifact depicts an event.', 1, 1, 0, 'confidence_unknown', 160),
  ('rel_type_documents', 'documents', 'Documents', 'Documented By', 'archive', 'An object documents another archive object or context.', 1, 1, 0, 'confidence_unknown', 170),
  ('rel_type_belongs_to_collection', 'belongs_to_collection', 'Belongs To Collection', 'Contains', 'collection', 'An archive object belongs to a collection.', 1, 1, 0, 'confidence_unknown', 180),
  ('rel_type_describes', 'describes', 'Describes', 'Described By', 'story', 'A story or object describes another archive object.', 1, 1, 0, 'confidence_unknown', 190),
  ('rel_type_associated_with', 'associated_with', 'Associated With', 'Associated With', 'archive', 'General association when a more specific relationship type is not available.', 1, 0, 0, 'confidence_unknown', 200),
  ('rel_type_lived_at', 'lived_at', 'Lived At', 'Residence Of', 'place', 'A person lived at or was associated with a residence/place.', 1, 1, 0, 'confidence_unknown', 210),
  ('rel_type_attended_school', 'attended_school', 'Attended School', 'School Attended By', 'event', 'A person attended a school or education-related place.', 1, 1, 0, 'confidence_unknown', 220),
  ('rel_type_served_in', 'served_in', 'Served In', 'Service Of', 'event', 'A person served in a military, civic, or other service context.', 1, 1, 0, 'confidence_unknown', 230);

INSERT OR IGNORE INTO relationship_type_roles (
  id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required
) VALUES
  ('rel_role_family_union_partner', 'rel_type_family_union', 'partner', 'person', 1, 2, 10, 1),
  ('rel_role_family_union_child', 'rel_type_family_union', 'child', 'person', 0, NULL, 20, 0),
  ('rel_role_appears_in_subject', 'rel_type_appears_in', 'subject', 'person', 1, NULL, 10, 1),
  ('rel_role_appears_in_artifact', 'rel_type_appears_in', 'artifact', 'artifact', 1, 1, 20, 1),
  ('rel_role_occurred_at_event', 'rel_type_occurred_at', 'event', 'event', 1, 1, 10, 1),
  ('rel_role_occurred_at_place', 'rel_type_occurred_at', 'place', 'place', 1, 1, 20, 1),
  ('rel_role_depicts_event_artifact', 'rel_type_depicts_event', 'artifact', 'artifact', 1, 1, 10, 1),
  ('rel_role_depicts_event_event', 'rel_type_depicts_event', 'event', 'event', 1, 1, 20, 1),
  ('rel_role_belongs_collection_item_person', 'rel_type_belongs_to_collection', 'item', 'person', 0, NULL, 10, 0),
  ('rel_role_belongs_collection_item_artifact', 'rel_type_belongs_to_collection', 'item', 'artifact', 0, NULL, 11, 0),
  ('rel_role_belongs_collection_item_event', 'rel_type_belongs_to_collection', 'item', 'event', 0, NULL, 12, 0),
  ('rel_role_belongs_collection_item_place', 'rel_type_belongs_to_collection', 'item', 'place', 0, NULL, 13, 0),
  ('rel_role_belongs_collection_item_story', 'rel_type_belongs_to_collection', 'item', 'story', 0, NULL, 14, 0),
  ('rel_role_belongs_collection_item_claim', 'rel_type_belongs_to_collection', 'item', 'claim', 0, NULL, 15, 0),
  ('rel_role_belongs_collection_collection', 'rel_type_belongs_to_collection', 'collection', 'collection', 1, 1, 20, 1),
  ('rel_role_associated_with_person', 'rel_type_associated_with', 'item', 'person', 0, NULL, 10, 0),
  ('rel_role_associated_with_artifact', 'rel_type_associated_with', 'item', 'artifact', 0, NULL, 11, 0),
  ('rel_role_associated_with_event', 'rel_type_associated_with', 'item', 'event', 0, NULL, 12, 0),
  ('rel_role_associated_with_place', 'rel_type_associated_with', 'item', 'place', 0, NULL, 13, 0),
  ('rel_role_associated_with_story', 'rel_type_associated_with', 'item', 'story', 0, NULL, 14, 0),
  ('rel_role_associated_with_collection', 'rel_type_associated_with', 'item', 'collection', 0, NULL, 15, 0),
  ('rel_role_associated_with_claim', 'rel_type_associated_with', 'item', 'claim', 0, NULL, 16, 0),
  ('rel_role_lived_at_person', 'rel_type_lived_at', 'person', 'person', 1, 1, 10, 1),
  ('rel_role_lived_at_place', 'rel_type_lived_at', 'place', 'place', 1, 1, 20, 1),
  ('rel_role_attended_school_person', 'rel_type_attended_school', 'person', 'person', 1, 1, 10, 1),
  ('rel_role_attended_school_place', 'rel_type_attended_school', 'place', 'place', 1, 1, 20, 1),
  ('rel_role_served_in_person', 'rel_type_served_in', 'person', 'person', 1, 1, 10, 1),
  ('rel_role_served_in_event', 'rel_type_served_in', 'event', 'event', 1, 1, 20, 1);

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
