-- Adds the three artifact identities the Artifact Model lists but that were
-- never seeded: Diary, Report Card and Military Document.
--
-- Docs/Apex_Family_Legacy_2.0/Artifact_Model.md answers "What is this?" with a
-- list of example identities. Twelve of those shipped in migration 042; these
-- three did not, which left real items with no accurate home — a WWI draft card
-- had to be filed as a generic Document.
--
-- These describe what an item *is*, not how it is used. A draft card is a
-- Military Document by identity; its standing as proof of service is expressed
-- separately through its evidence classification (Official Record), exactly as
-- the model requires:
--
--   "Grandpa's WWII draft notice is always a letter. It may also serve as
--    official evidence of military service. Those are two separate concepts."
--
-- Appended after the existing types rather than slotted in alphabetically, so
-- no established sort_order shifts underneath anyone.

INSERT OR IGNORE INTO artifact_types (id, name, description, icon, is_system, sort_order) VALUES
  ('artifact_type_diary', 'Diary', 'Diary, journal, or personal daily record.', 'notebook-pen', 1, 130),
  ('artifact_type_report_card', 'Report Card', 'School report card or academic record.', 'graduation-cap', 1, 140),
  ('artifact_type_military_document', 'Military Document', 'Military record such as a draft card, discharge paper, or service record.', 'shield', 1, 150);
