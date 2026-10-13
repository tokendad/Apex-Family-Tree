-- Put back the sort key the broken parser produced for a YYYY-MM-DD date:
-- the year alone, with the month and day dropped.
--
-- Restoring a wrong value is what a down migration is for. Rolling 076 back
-- without this would leave correct keys behind alongside a parser that no
-- longer agrees with them, and the next edit of any such row would move it --
-- a rollback should put the archive where it was, not somewhere new.

UPDATE events
SET event_date_sort_key = CAST(substr(event_date, 1, 4) AS INTEGER) * 10000
WHERE event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

UPDATE families
SET marriage_date_sort_key = CAST(substr(marriage_date, 1, 4) AS INTEGER) * 10000
WHERE marriage_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
