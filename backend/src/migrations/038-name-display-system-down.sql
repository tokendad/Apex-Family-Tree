-- Rollback: Remove name display system fields
-- Migration: 038 DOWN

-- Remove indexes
DROP INDEX IF EXISTS idx_names_middle_name;
DROP INDEX IF EXISTS idx_names_nickname;

-- SQLite doesn't support DROP COLUMN directly in older versions
-- We need to recreate the tables without the new columns

-- Remove setting
DELETE FROM app_settings WHERE key = 'name_display_format';

-- For persons.display_name - SQLite requires table recreation for column removal
-- For names.middle_name and names.nickname - same issue

-- Create backup tables
CREATE TABLE IF NOT EXISTS names_backup AS SELECT 
  id, person_id, name_type, prefix, given_name, surname, suffix, 
  is_primary, sort_order, created_at, updated_at 
FROM names;

CREATE TABLE IF NOT EXISTS persons_backup AS SELECT 
  id, sex, is_living, is_private, gedcom_id, notes, 
  created_by, created_at, updated_at 
FROM persons;

-- Drop original tables
DROP TABLE names;
DROP TABLE persons;

-- Recreate original tables (from migrations 006 and 007)
CREATE TABLE persons (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sex TEXT CHECK (sex IN ('M', 'F', 'X', 'U')) DEFAULT 'U',
  is_living INTEGER NOT NULL DEFAULT 1,
  is_private INTEGER NOT NULL DEFAULT 0,
  gedcom_id TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE names (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  name_type TEXT NOT NULL DEFAULT 'birth' CHECK (name_type IN ('birth', 'married', 'aka', 'nickname', 'formal', 'religious')),
  prefix TEXT,
  given_name TEXT,
  surname TEXT,
  suffix TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Restore data
INSERT INTO persons SELECT * FROM persons_backup;
INSERT INTO names SELECT * FROM names_backup;

-- Drop backup tables
DROP TABLE persons_backup;
DROP TABLE names_backup;

-- Recreate indexes
CREATE INDEX idx_persons_gedcom_id ON persons(gedcom_id);
CREATE INDEX idx_persons_living ON persons(is_living);
CREATE INDEX idx_names_person ON names(person_id);
CREATE INDEX idx_names_surname ON names(surname COLLATE NOCASE);
CREATE INDEX idx_names_given ON names(given_name COLLATE NOCASE);
