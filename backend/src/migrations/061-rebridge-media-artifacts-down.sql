-- Remove the artifact rows this migration created for media items.
--
-- Only rows whose id matches a media item and whose artifact_files entry
-- carries the generated id are removed, so artifacts catalogued by hand are
-- left alone. archive_objects cascades to artifacts, which cascades to
-- artifact_files, so the delete is ordered innermost first for clarity.

DELETE FROM artifact_files
 WHERE id IN (
   SELECT 'artifact_file_media_' || mi.id FROM media_items mi
   UNION ALL
   SELECT 'artifact_file_thumb_' || mi.id FROM media_items mi
 );

DELETE FROM artifacts WHERE id IN (SELECT id FROM media_items);

DELETE FROM archive_objects
 WHERE object_type = 'artifact' AND id IN (SELECT id FROM media_items);
