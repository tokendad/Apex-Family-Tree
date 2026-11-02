-- Bridge scanned media into the archive model.
--
-- 045 backfilled every media_items row as an artifact, and MediaRepository's
-- create() has kept uploads in step since (syncArtifact). scanDirectory never
-- did: it inserts media_items with its own statement and skips the sync, so
-- every file picked up from MEDIA_PATH after 045 ran became a media item with
-- no artifact identity. The person page lists such a row on its Artifacts tab
-- anyway -- the file is what the card shows -- and the card links to
-- /artifacts/:id, which 404s with "Artifact not found".
--
-- This is 045's bridge run again over the rows that have accumulated since,
-- plus 063's person_media -> "appears in" relationships for them, so a
-- scanned letter is catalogued exactly like an uploaded one. Every statement
-- is guarded on NOT EXISTS, so applying it to an already-bridged archive is a
-- no-op. The scanner itself is fixed in the same change; this repairs what it
-- has already imported, which a re-scan cannot (it skips known file paths).

-- ── 1. media_items -> archive_objects ────────────────────────────────────────
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted,
  created_at, updated_at, created_by, updated_by
)
SELECT
  mi.id,
  'artifact',
  COALESCE(NULLIF(TRIM(mi.title), ''), NULLIF(TRIM(mi.original_filename), ''), NULLIF(TRIM(mi.filename), ''), 'Untitled Artifact'),
  NULLIF(TRIM(mi.description), ''),
  'family',
  0,
  COALESCE(mi.created_at, datetime('now')),
  COALESCE(mi.updated_at, datetime('now')),
  mi.uploaded_by,
  mi.uploaded_by
FROM media_items mi
WHERE NOT EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = mi.id);

-- ── 2. artifacts ─────────────────────────────────────────────────────────────
-- Same MIME mapping as 045 and syncArtifact: anything that is not image,
-- video or audio is a Document. A scan of letters arrives as Document and the
-- Artifacts page's bulk re-type is how one becomes a Letter.
INSERT OR IGNORE INTO artifacts (
  id, artifact_type_id, evidence_classification_id, original_date_text, original_format, notes
)
SELECT
  mi.id,
  CASE
    WHEN mi.mime_type LIKE 'image/%' THEN 'artifact_type_photo'
    WHEN mi.mime_type LIKE 'video/%' THEN 'artifact_type_video'
    WHEN mi.mime_type LIKE 'audio/%' THEN 'artifact_type_audio_recording'
    ELSE 'artifact_type_document'
  END,
  NULL,
  NULLIF(TRIM(mi.date_taken), ''),
  mi.mime_type,
  NULL
FROM media_items mi
INNER JOIN archive_objects ao ON ao.id = mi.id AND ao.object_type = 'artifact'
WHERE NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.id = mi.id);

-- ── 3. artifact_files ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO artifact_files (
  id, artifact_id, file_role, storage_provider, storage_path, original_filename,
  mime_type, size_bytes, created_at
)
SELECT
  'artifact_file_media_' || mi.id,
  mi.id,
  'primary',
  'local',
  mi.file_path,
  mi.original_filename,
  mi.mime_type,
  mi.file_size,
  COALESCE(mi.created_at, datetime('now'))
FROM media_items mi
INNER JOIN artifacts a ON a.id = mi.id
WHERE NOT EXISTS (
  SELECT 1 FROM artifact_files af WHERE af.id = 'artifact_file_media_' || mi.id
);

INSERT OR IGNORE INTO artifact_files (
  id, artifact_id, file_role, storage_provider, storage_path, original_filename,
  mime_type, size_bytes, created_at
)
SELECT
  'artifact_file_thumb_' || mi.id,
  mi.id,
  'thumbnail',
  'local',
  mi.thumbnail_path,
  mi.original_filename,
  mi.mime_type,
  NULL,
  COALESCE(mi.created_at, datetime('now'))
FROM media_items mi
INNER JOIN artifacts a ON a.id = mi.id
WHERE NULLIF(TRIM(COALESCE(mi.thumbnail_path, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM artifact_files af WHERE af.id = 'artifact_file_thumb_' || mi.id
  );

-- ── 4. person_media -> "appears in" relationships ────────────────────────────
-- 063's section 3, repeated for the media that has just acquired an artifact
-- identity. One relationship per media item (the appears_in contract allows
-- one artifact and any number of subjects), with ids derived from the media id
-- so this stays re-runnable.
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
INNER JOIN artifacts a ON a.id = pm.media_id
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

INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT DISTINCT
  'relm_artifact_' || pm.media_id,
  'rel_appears_in_media_' || pm.media_id,
  pm.media_id,
  'artifact',
  0
FROM person_media pm
INNER JOIN relationships r ON r.id = 'rel_appears_in_media_' || pm.media_id
INNER JOIN artifacts a ON a.id = pm.media_id
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_members rm
  WHERE rm.relationship_id = 'rel_appears_in_media_' || pm.media_id
    AND rm.object_id = pm.media_id
    AND rm.role = 'artifact'
);

INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
SELECT
  'relm_subject_' || pm.media_id || '_' || pm.person_id,
  'rel_appears_in_media_' || pm.media_id,
  pm.person_id,
  'subject',
  pm.sort_order
FROM person_media pm
INNER JOIN relationships r ON r.id = 'rel_appears_in_media_' || pm.media_id
INNER JOIN archive_objects ao ON ao.id = pm.person_id
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_members rm
  WHERE rm.relationship_id = 'rel_appears_in_media_' || pm.media_id
    AND rm.object_id = pm.person_id
    AND rm.role = 'subject'
);
