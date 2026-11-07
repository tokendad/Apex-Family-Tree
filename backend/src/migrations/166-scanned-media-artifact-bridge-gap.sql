-- Re-run 077's bridge for the scan window it couldn't reach.
--
-- 077 bridged every media_items row that existed on 2026-10-14 into the
-- archive model, and fixed scanDirectory to sync new scans going forward.
-- But the scanner fix didn't actually ship until v2.7.1 (2026-11-07): any
-- file picked up by a scan between those two dates was inserted by the old,
-- unfixed scanDirectory and so still has no archive_objects/artifacts row,
-- the same "Artifact not found" symptom 077 describes. A plain re-scan can't
-- repair these either -- it skips any file_path it already has a row for.
--
-- Same statements as 077, so this is a no-op on an archive that has no gap
-- rows left, and catches anything bridged there too (NOT EXISTS-guarded).

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
