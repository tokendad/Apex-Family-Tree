-- Ensure person deletions cascade to FTS and clean up primary photo references
CREATE TRIGGER IF NOT EXISTS persons_fts_person_delete AFTER DELETE ON persons
BEGIN
  DELETE FROM persons_fts WHERE person_id = OLD.id;
END;
