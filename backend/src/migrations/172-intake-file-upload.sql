-- Issue #73 Phase 2: image/PDF intake.
--
-- source_text stays NOT NULL (a file-only submission stores '' there) rather
-- than rebuilding the table to make it nullable -- 171 is one migration old
-- and this avoids the foreign-key-off rebuild dance for a column that only
-- ever needs "no text was pasted" as its empty state.
--
-- The three new columns describe a file staged on disk under DATA_DIR (never
-- MEDIA_PATH -- that is the user's own photo library, and a transient
-- intake upload left there would be adopted by the next manual media scan as
-- an unrelated new artifact). No REFERENCES clause, same reasoning as 171's
-- other additions: these describe a file, not a record, so a plain ADD
-- COLUMN / DROP COLUMN pair is all the down migration needs.
ALTER TABLE intake_items ADD COLUMN source_file_path TEXT;
ALTER TABLE intake_items ADD COLUMN source_file_mime_type TEXT;
ALTER TABLE intake_items ADD COLUMN source_file_original_name TEXT;
