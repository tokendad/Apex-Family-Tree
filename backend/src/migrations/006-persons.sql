-- Core persons table
CREATE TABLE IF NOT EXISTS persons (
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

CREATE INDEX IF NOT EXISTS idx_persons_gedcom_id ON persons(gedcom_id);
CREATE INDEX IF NOT EXISTS idx_persons_living ON persons(is_living);
