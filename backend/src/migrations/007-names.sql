-- Person names (supports multiple names per person)
CREATE TABLE IF NOT EXISTS names (
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

CREATE INDEX IF NOT EXISTS idx_names_person ON names(person_id);
CREATE INDEX IF NOT EXISTS idx_names_surname ON names(surname COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_names_given ON names(given_name COLLATE NOCASE);
