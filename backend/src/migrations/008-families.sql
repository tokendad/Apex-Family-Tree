-- Family units (spouse groupings)
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  spouse1_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  spouse2_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  marriage_date TEXT,
  marriage_date_qualifier TEXT CHECK (marriage_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  marriage_date_sort_key INTEGER,
  marriage_place TEXT,
  divorce_date TEXT,
  divorce_place TEXT,
  gedcom_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_families_spouse1 ON families(spouse1_id);
CREATE INDEX IF NOT EXISTS idx_families_spouse2 ON families(spouse2_id);
CREATE INDEX IF NOT EXISTS idx_families_gedcom ON families(gedcom_id);
