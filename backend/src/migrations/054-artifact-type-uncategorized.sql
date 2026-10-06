-- Adds an explicit "Uncategorized" artifact type and moves every existing
-- artifact into it.
--
-- Why: no artifact in the archive has ever had its type deliberately chosen.
-- Migration 045 assigned types mechanically from MIME type when it bridged
-- legacy media (image/* -> Photo, video/* -> Video, audio/* -> Audio Recording,
-- everything else -> Document). That guess is wrong in exactly the cases that
-- matter — a photographed or scanned document is a Document, not a Photo — and
-- because the guess is indistinguishable from a real choice, there is no way to
-- tell which artifacts still need review.
--
-- Moving everything to Uncategorized makes the backlog visible: the bulk
-- re-type tool can work the Uncategorized queue down, and anything left there
-- is honestly marked as "nobody has said what this is yet".
--
-- sort_order 0 places Uncategorized first, which also makes it the default
-- selection in the artifact create form (the UI defaults to the first type).
-- That is intentional: a new artifact nobody has classified belongs here.

INSERT OR IGNORE INTO artifact_types (id, name, description, icon, is_system, sort_order) VALUES
  ('artifact_type_uncategorized', 'Uncategorized', 'Not yet classified. Artifacts land here until someone chooses a type.', 'help-circle', 1, 0);

UPDATE artifacts
SET artifact_type_id = 'artifact_type_uncategorized';
