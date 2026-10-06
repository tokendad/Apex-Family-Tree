-- Reverses 054 by re-deriving the MIME-based types that migration 045 assigned.
--
-- 045 stored the source MIME type in artifacts.original_format at the same time
-- it derived the artifact type from it, so the original guess can be
-- reconstructed from that column alone — no join back to media_items is needed,
-- and the CASE below is the same mapping 045 used.
--
-- Artifacts with no recorded original_format fall back to Document, matching
-- 045's own else branch.
--
-- Note this restores the *guess*, not any deliberate choices made after 054 ran.
-- That is unavoidable, and is precisely the problem 054 exists to fix: before
-- it, a guess and a real choice were indistinguishable.

UPDATE artifacts
SET artifact_type_id = CASE
  WHEN original_format LIKE 'image/%' THEN 'artifact_type_photo'
  WHEN original_format LIKE 'video/%' THEN 'artifact_type_video'
  WHEN original_format LIKE 'audio/%' THEN 'artifact_type_audio_recording'
  ELSE 'artifact_type_document'
END
WHERE artifact_type_id = 'artifact_type_uncategorized';

DELETE FROM artifact_types WHERE id = 'artifact_type_uncategorized';
