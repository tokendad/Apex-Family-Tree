-- Sources (books, documents, certificates)
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  repository_id TEXT REFERENCES source_repositories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  publication_date TEXT,
  url TEXT,
  notes TEXT,
  gedcom_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_repository ON sources(repository_id);
CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title COLLATE NOCASE);
