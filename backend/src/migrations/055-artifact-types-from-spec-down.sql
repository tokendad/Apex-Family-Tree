-- Reverses 055.
--
-- artifacts.artifact_type_id is NOT NULL and references artifact_types, so any
-- artifact already filed under one of these must be moved before the type can
-- be removed. They go to Uncategorized rather than Document: the whole point of
-- these types is that Document was not an accurate answer, and parking them in
-- the review queue is honest about the fact that their identity is once again
-- undetermined.

UPDATE artifacts
SET artifact_type_id = 'artifact_type_uncategorized'
WHERE artifact_type_id IN (
  'artifact_type_diary',
  'artifact_type_report_card',
  'artifact_type_military_document'
);

DELETE FROM artifact_types
WHERE id IN (
  'artifact_type_diary',
  'artifact_type_report_card',
  'artifact_type_military_document'
);
