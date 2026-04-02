-- Source citations linked to persons or events
CREATE TABLE IF NOT EXISTS source_citations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  page TEXT,
  quality TEXT CHECK (quality IN ('primary', 'secondary', 'questionable', 'unreliable')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_citations_source ON source_citations(source_id);
CREATE INDEX IF NOT EXISTS idx_citations_person ON source_citations(person_id);
CREATE INDEX IF NOT EXISTS idx_citations_event ON source_citations(event_id);
