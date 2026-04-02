-- Source repositories (archives, libraries, websites)
CREATE TABLE IF NOT EXISTS source_repositories (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  address TEXT,
  url TEXT,
  notes TEXT,
  gedcom_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
