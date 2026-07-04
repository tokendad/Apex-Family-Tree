-- Apex Family Legacy 2.0 stories and narrative context.
-- Stories are archive objects and connect to other archive objects through the
-- validated relationship engine.

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  story_type TEXT NOT NULL DEFAULT 'story' CHECK (story_type IN ('story', 'memory', 'oral_history', 'note')),
  body_markdown TEXT NOT NULL,
  narrator_person_id TEXT REFERENCES persons(id),
  recorded_by_user_id TEXT REFERENCES users(id),
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stories_type ON stories(story_type);
CREATE INDEX IF NOT EXISTS idx_stories_narrator ON stories(narrator_person_id);
CREATE INDEX IF NOT EXISTS idx_stories_recorded_by ON stories(recorded_by_user_id);

INSERT OR IGNORE INTO relationship_type_roles (
  id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required
) VALUES
  ('rel_role_describes_story', 'rel_type_describes', 'story', 'story', 1, 1, 10, 1),
  ('rel_role_describes_subject_person', 'rel_type_describes', 'subject', 'person', 0, NULL, 20, 0),
  ('rel_role_describes_subject_artifact', 'rel_type_describes', 'subject', 'artifact', 0, NULL, 21, 0),
  ('rel_role_describes_subject_event', 'rel_type_describes', 'subject', 'event', 0, NULL, 22, 0),
  ('rel_role_describes_subject_place', 'rel_type_describes', 'subject', 'place', 0, NULL, 23, 0),
  ('rel_role_describes_subject_claim', 'rel_type_describes', 'subject', 'claim', 0, NULL, 24, 0),
  ('rel_role_describes_subject_collection', 'rel_type_describes', 'subject', 'collection', 0, NULL, 25, 0);
