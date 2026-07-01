-- Add missing role contracts for provenance and document-style relationship types.
-- This migration is additive because prior migrations are checksum-protected.

INSERT OR IGNORE INTO relationship_type_roles (
  id,
  relationship_type_id,
  role,
  allowed_object_type,
  min_count,
  max_count,
  sort_order,
  is_required
) VALUES
  -- created_by: an archive object was created by one or more people.
  ('rel_role_created_by_object_artifact', 'rel_type_created_by', 'object', 'artifact', 1, NULL, 10, 1),
  ('rel_role_created_by_object_story', 'rel_type_created_by', 'object', 'story', 1, NULL, 11, 1),
  ('rel_role_created_by_object_event', 'rel_type_created_by', 'object', 'event', 1, NULL, 12, 1),
  ('rel_role_created_by_object_place', 'rel_type_created_by', 'object', 'place', 1, NULL, 13, 1),
  ('rel_role_created_by_object_collection', 'rel_type_created_by', 'object', 'collection', 1, NULL, 14, 1),
  ('rel_role_created_by_object_claim', 'rel_type_created_by', 'object', 'claim', 1, NULL, 15, 1),
  ('rel_role_created_by_creator', 'rel_type_created_by', 'creator', 'person', 1, NULL, 20, 1),

  -- owned_by: an artifact was owned by one or more people.
  ('rel_role_owned_by_artifact', 'rel_type_owned_by', 'artifact', 'artifact', 1, 1, 10, 1),
  ('rel_role_owned_by_owner', 'rel_type_owned_by', 'owner', 'person', 1, NULL, 20, 1),

  -- donated_by: an artifact was donated by one or more people.
  ('rel_role_donated_by_artifact', 'rel_type_donated_by', 'artifact', 'artifact', 1, 1, 10, 1),
  ('rel_role_donated_by_donor', 'rel_type_donated_by', 'donor', 'person', 1, NULL, 20, 1),

  -- scanned_by: an artifact was scanned or digitized by one or more people.
  ('rel_role_scanned_by_artifact', 'rel_type_scanned_by', 'artifact', 'artifact', 1, 1, 10, 1),
  ('rel_role_scanned_by_scanner', 'rel_type_scanned_by', 'scanner', 'person', 1, NULL, 20, 1),

  -- identified_by: an archive object or subject was identified by one or more people.
  ('rel_role_identified_by_subject_person', 'rel_type_identified_by', 'subject', 'person', 1, NULL, 10, 1),
  ('rel_role_identified_by_subject_artifact', 'rel_type_identified_by', 'subject', 'artifact', 1, NULL, 11, 1),
  ('rel_role_identified_by_subject_event', 'rel_type_identified_by', 'subject', 'event', 1, NULL, 12, 1),
  ('rel_role_identified_by_subject_place', 'rel_type_identified_by', 'subject', 'place', 1, NULL, 13, 1),
  ('rel_role_identified_by_subject_story', 'rel_type_identified_by', 'subject', 'story', 1, NULL, 14, 1),
  ('rel_role_identified_by_subject_collection', 'rel_type_identified_by', 'subject', 'collection', 1, NULL, 15, 1),
  ('rel_role_identified_by_subject_claim', 'rel_type_identified_by', 'subject', 'claim', 1, NULL, 16, 1),
  ('rel_role_identified_by_identifier', 'rel_type_identified_by', 'identifier', 'person', 1, NULL, 20, 1),

  -- documents: an artifact documents one or more archive subjects.
  ('rel_role_documents_document', 'rel_type_documents', 'document', 'artifact', 1, NULL, 10, 1),
  ('rel_role_documents_subject_person', 'rel_type_documents', 'subject', 'person', 1, NULL, 20, 1),
  ('rel_role_documents_subject_artifact', 'rel_type_documents', 'subject', 'artifact', 1, NULL, 21, 1),
  ('rel_role_documents_subject_event', 'rel_type_documents', 'subject', 'event', 1, NULL, 22, 1),
  ('rel_role_documents_subject_place', 'rel_type_documents', 'subject', 'place', 1, NULL, 23, 1),
  ('rel_role_documents_subject_story', 'rel_type_documents', 'subject', 'story', 1, NULL, 24, 1),
  ('rel_role_documents_subject_collection', 'rel_type_documents', 'subject', 'collection', 1, NULL, 25, 1),
  ('rel_role_documents_subject_claim', 'rel_type_documents', 'subject', 'claim', 1, NULL, 26, 1);
