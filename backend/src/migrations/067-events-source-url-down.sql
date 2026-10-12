-- Remove the event source URL and its last-checked date.
ALTER TABLE events DROP COLUMN source_url_checked_at;
ALTER TABLE events DROP COLUMN source_url;
