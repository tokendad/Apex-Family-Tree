-- Apex Family Legacy 2.0 relationship engine.
-- Relationships are first-class archive objects with validated members.

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id),
  label TEXT,
  description TEXT,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  date_precision TEXT,
  date_qualifier TEXT,
  confidence_level_id TEXT REFERENCES confidence_levels(id),
  confidence_score INTEGER CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS relationship_members (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE (relationship_id, object_id, role)
);

CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type_id);
CREATE INDEX IF NOT EXISTS idx_relationships_confidence ON relationships(confidence_level_id);
CREATE INDEX IF NOT EXISTS idx_relationship_members_relationship ON relationship_members(relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_members_object ON relationship_members(object_id);
CREATE INDEX IF NOT EXISTS idx_relationship_members_role ON relationship_members(role);
