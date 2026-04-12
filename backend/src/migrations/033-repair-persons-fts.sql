-- Repair persons_fts: replace contentless FTS5 with content-storing FTS5
-- Drops old table + all triggers from migrations 023 and 029, then recreates

-- Drop all existing FTS triggers
DROP TRIGGER IF EXISTS persons_fts_insert;
DROP TRIGGER IF EXISTS persons_fts_update;
DROP TRIGGER IF EXISTS persons_fts_delete;
DROP TRIGGER IF EXISTS persons_fts_notes_update;
DROP TRIGGER IF EXISTS persons_fts_person_delete;

-- Drop old contentless FTS5 table
DROP TABLE IF EXISTS persons_fts;

-- Recreate as content-storing FTS5 (no content='' — stores column values)
CREATE VIRTUAL TABLE persons_fts USING fts5(
  person_id UNINDEXED,
  given_name,
  surname,
  notes,
  tokenize='unicode61'
);

-- Populate from existing data (one row per person, aggregated names)
INSERT INTO persons_fts(person_id, given_name, surname, notes)
SELECT
  p.id,
  (SELECT group_concat(n.given_name, ' ') FROM names n WHERE n.person_id = p.id),
  (SELECT group_concat(n.surname, ' ') FROM names n WHERE n.person_id = p.id),
  p.notes
FROM persons p;

-- Trigger: sync on name INSERT (delete + insert to prevent duplicates)
CREATE TRIGGER persons_fts_insert AFTER INSERT ON names
BEGIN
  DELETE FROM persons_fts WHERE person_id = NEW.person_id;
  INSERT INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT notes FROM persons WHERE id = NEW.person_id);
END;

-- Trigger: sync on name UPDATE
CREATE TRIGGER persons_fts_update AFTER UPDATE ON names
BEGIN
  DELETE FROM persons_fts WHERE person_id = NEW.person_id;
  INSERT INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT notes FROM persons WHERE id = NEW.person_id);
END;

-- Trigger: sync on name DELETE (re-insert only if person still has names)
CREATE TRIGGER persons_fts_delete AFTER DELETE ON names
BEGIN
  DELETE FROM persons_fts WHERE person_id = OLD.person_id;
  INSERT INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    OLD.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = OLD.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = OLD.person_id),
    (SELECT notes FROM persons WHERE id = OLD.person_id)
  WHERE EXISTS (SELECT 1 FROM persons WHERE id = OLD.person_id);
END;

-- Trigger: sync on person notes UPDATE
CREATE TRIGGER persons_fts_notes_update AFTER UPDATE OF notes ON persons
BEGIN
  DELETE FROM persons_fts WHERE person_id = NEW.id;
  INSERT INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.id),
    NEW.notes
  WHERE EXISTS (SELECT 1 FROM names WHERE person_id = NEW.id);
END;

-- Trigger: clean up FTS on person delete
CREATE TRIGGER persons_fts_person_delete AFTER DELETE ON persons
BEGIN
  DELETE FROM persons_fts WHERE person_id = OLD.id;
END;
