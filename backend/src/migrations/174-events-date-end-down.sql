-- Rollback for 174-events-date-end.sql.
ALTER TABLE events DROP COLUMN event_date_end_sort_key;
ALTER TABLE events DROP COLUMN event_date_end;
