-- Full-text search virtual table for persons
CREATE VIRTUAL TABLE IF NOT EXISTS persons_fts USING fts5(
  person_id UNINDEXED,
  given_name,
  surname,
  notes,
  content='',
  tokenize='unicode61'
);

-- Trigger: sync on name INSERT
CREATE TRIGGER IF NOT EXISTS persons_fts_insert AFTER INSERT ON names
BEGIN
  INSERT OR REPLACE INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT notes FROM persons WHERE id = NEW.person_id)
  ;
END;

-- Trigger: sync on name UPDATE
CREATE TRIGGER IF NOT EXISTS persons_fts_update AFTER UPDATE ON names
BEGIN
  DELETE FROM persons_fts WHERE person_id = NEW.person_id;
  INSERT INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
    (SELECT notes FROM persons WHERE id = NEW.person_id)
  ;
END;

-- Trigger: sync on name DELETE
CREATE TRIGGER IF NOT EXISTS persons_fts_delete AFTER DELETE ON names
BEGIN
  DELETE FROM persons_fts WHERE person_id = OLD.person_id;
  INSERT OR IGNORE INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    OLD.person_id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = OLD.person_id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = OLD.person_id),
    (SELECT notes FROM persons WHERE id = OLD.person_id)
  WHERE EXISTS (SELECT 1 FROM names WHERE person_id = OLD.person_id);
END;

-- Trigger: sync on person notes UPDATE
CREATE TRIGGER IF NOT EXISTS persons_fts_notes_update AFTER UPDATE OF notes ON persons
BEGIN
  DELETE FROM persons_fts WHERE person_id = NEW.id;
  INSERT OR IGNORE INTO persons_fts(person_id, given_name, surname, notes)
  SELECT
    NEW.id,
    (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.id),
    (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.id),
    NEW.notes
  WHERE EXISTS (SELECT 1 FROM names WHERE person_id = NEW.id);
END;
