-- Apex Family Legacy 2.0 archive-wide search.
-- Phase 10 uses a service-maintained FTS index that can be rebuilt from the
-- canonical archive tables without replacing existing persons_fts behavior.

CREATE VIRTUAL TABLE IF NOT EXISTS archive_search USING fts5(
  object_id UNINDEXED,
  object_type UNINDEXED,
  title,
  summary,
  body,
  tags,
  names,
  tokenize = 'porter'
);
