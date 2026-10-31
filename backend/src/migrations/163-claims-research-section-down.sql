-- Reverse 163: drop claims.research_section.
--
-- The column holds only derived pointers -- slugs read off persons.notes -- so
-- dropping it loses which passage each claim cited, but no prose. The notes
-- themselves are untouched by this migration in either direction.

ALTER TABLE claims DROP COLUMN research_section;
