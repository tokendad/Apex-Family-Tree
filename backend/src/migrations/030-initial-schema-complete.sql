-- Marker migration: initial schema is complete
-- This migration verifies all expected tables exist
SELECT CASE WHEN (
  (SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN (
    'users', 'invite_tokens', 'refresh_tokens', 'password_reset_tokens',
    'persons', 'names', 'families', 'events', 'family_members',
    'source_repositories', 'sources', 'source_citations',
    'media_items', 'person_media', 'family_media', 'event_media',
    'import_jobs', 'gedcom_xref_map', 'import_conflicts', 'import_audit_log', 'export_jobs',
    'app_settings', 'feature_flags', 'audit_log', 'backup_log'
  )) = 25
) THEN 'Schema verification passed'
ELSE RAISE(ABORT, 'Schema verification failed: missing tables')
END;
