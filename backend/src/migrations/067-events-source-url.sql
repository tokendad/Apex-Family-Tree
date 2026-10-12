-- An optional web source for an event, with the date it was last confirmed
-- to resolve (#41).
--
-- Separate from source_citations on purpose. A citation says "this source
-- supports this fact" and points at a catalogued source record; this is the
-- lighter note of "here is the page I read it on". The obituary URL that
-- prompted this had been pasted into the event description, where nothing
-- could render it as a link or tell whether it still loads.
--
-- source_url_checked_at is the link-rot date and has no equivalent in the
-- citation model, which is the clearest sign the two are different things.
-- Stored as YYYY-MM-DD: it is a day the user asserts, not an event date, so
-- it is never parsed by parseGedcomDate and carries no qualifier.
--
-- ADD COLUMN rather than the table rebuild 062 used. That rebuild was needed
-- to widen a CHECK constraint; nothing here changes one, and a rebuild would
-- have to be repeated for source_citations and event_media, whose foreign
-- keys point at this table.
ALTER TABLE events ADD COLUMN source_url TEXT;
ALTER TABLE events ADD COLUMN source_url_checked_at TEXT;
