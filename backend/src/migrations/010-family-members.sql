-- Children linked to families
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'child' CHECK (role IN ('child', 'adopted', 'foster', 'step')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_person ON family_members(person_id);
