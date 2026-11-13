-- Issue #33: events cannot record an end date, so a span ("Segment Treater,
-- 1982-1990") has nowhere to go but the free-text value, where it does not
-- sort and cannot be queried. claims already has date_start/date_end, and
-- families effectively has one in marriage_date/divorce_date -- events were
-- the odd one out.
--
-- Rebuilding this table to widen a CHECK constraint has twice rewritten
-- foreign keys to a dropped events_old (031, 041, and the repair in 056), so
-- this is a plain ALTER TABLE ADD COLUMN rather than a rebuild.
ALTER TABLE events ADD COLUMN event_date_end TEXT;
ALTER TABLE events ADD COLUMN event_date_end_sort_key INTEGER;
