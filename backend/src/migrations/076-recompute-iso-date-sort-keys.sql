-- Recompute the sort key of every date written as YYYY-MM-DD.
--
-- The parser could never read that shape. "1990-11-29" is one
-- whitespace-delimited part, so it took the year-only branch, where parseInt
-- stops at the first hyphen and returns 1990; the ISO branch that should have
-- caught it sat behind a guard that was therefore never true. The date went
-- in stating a day and a month and came out sorting as 1 January.
--
-- The parser is fixed, but a sort key is computed once, when the row is
-- written. Every date already entered this way keeps its wrong key until
-- somebody edits the row again -- so a death on 26 November and the burial
-- three days later both sit at the start of 1990, ahead of events that
-- happened earlier in the year, and the only way to notice is to read the
-- timeline and find it out of order.
--
-- GLOB and not LIKE: LIKE's _ matches any character, GLOB's [0-9] matches a
-- digit, and the distinction is the whole guard here. Only rows whose text is
-- exactly ten characters of that shape are touched; a date with a qualifier
-- in front of it ("ABT 1990-11-29") already parsed correctly, because the
-- qualifier is stripped before the shape is read.

UPDATE events
SET event_date_sort_key =
  CAST(substr(event_date, 1, 4) AS INTEGER) * 10000 +
  CAST(substr(event_date, 6, 2) AS INTEGER) * 100 +
  CAST(substr(event_date, 9, 2) AS INTEGER)
WHERE event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

UPDATE families
SET marriage_date_sort_key =
  CAST(substr(marriage_date, 1, 4) AS INTEGER) * 10000 +
  CAST(substr(marriage_date, 6, 2) AS INTEGER) * 100 +
  CAST(substr(marriage_date, 9, 2) AS INTEGER)
WHERE marriage_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
