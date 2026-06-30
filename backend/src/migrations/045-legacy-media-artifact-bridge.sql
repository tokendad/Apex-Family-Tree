-- Apex Family Legacy 2.0 legacy media bridge.
-- Backfills existing media_items as artifacts while preserving legacy media
-- tables, file paths, thumbnails, and upload/scan behavior.

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

INSERT OR IGNORE INTO artifacts (
  id,
  artifact_type_id,
  evidence_classification_id,
  original_date_text,
  original_format,
  notes
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

INSERT OR IGNORE INTO artifact_files (
  id,
  artifact_id,
  file_role,
  storage_provider,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  created_at
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
  id,
  artifact_id,
  file_role,
  storage_provider,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  created_at
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
WHERE mi.thumbnail_path IS NOT NULL
  AND NULLIF(TRIM(mi.thumbnail_path), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM artifact_files af WHERE af.id = 'artifact_file_thumb_' || mi.id
  );
