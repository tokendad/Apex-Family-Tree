-- Apex Family Legacy 2.0 events/places bridge.
-- Preserve the legacy events table while giving events archive-object identity and
-- normalizing legacy event_place strings into reusable place archive objects.

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL UNIQUE,
  place_type TEXT,
  address_text TEXT,
  locality TEXT,
  region TEXT,
  country TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS place_aliases (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (place_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_places_normalized_name ON places(normalized_name);
CREATE INDEX IF NOT EXISTS idx_places_locality ON places(locality);
CREATE INDEX IF NOT EXISTS idx_place_aliases_place ON place_aliases(place_id);
CREATE INDEX IF NOT EXISTS idx_place_aliases_alias ON place_aliases(alias);

INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT
  e.id,
  'event',
  TRIM(
    CASE e.event_type
      WHEN 'birth' THEN 'Birth'
      WHEN 'death' THEN 'Death'
      WHEN 'burial' THEN 'Burial'
      WHEN 'cremation' THEN 'Cremation'
      WHEN 'baptism' THEN 'Baptism'
      WHEN 'christening' THEN 'Christening'
      WHEN 'bar_mitzvah' THEN 'Bar Mitzvah'
      WHEN 'bat_mitzvah' THEN 'Bat Mitzvah'
      WHEN 'confirmation' THEN 'Confirmation'
      WHEN 'first_communion' THEN 'First Communion'
      WHEN 'graduation' THEN 'Graduation'
      WHEN 'immigration' THEN 'Immigration'
      WHEN 'emigration' THEN 'Emigration'
      WHEN 'naturalization' THEN 'Naturalization'
      WHEN 'census' THEN 'Census'
      WHEN 'residence' THEN 'Residence'
      WHEN 'occupation' THEN 'Occupation'
      WHEN 'retirement' THEN 'Retirement'
      WHEN 'military_service' THEN 'Military Service'
      WHEN 'medical' THEN 'Medical'
      WHEN 'probate' THEN 'Probate'
      WHEN 'will' THEN 'Will'
      WHEN 'education' THEN 'Education'
      WHEN 'religion' THEN 'Religion'
      WHEN 'ssn' THEN 'SSN'
      WHEN 'title' THEN 'Title'
      WHEN 'marriage' THEN 'Marriage'
      WHEN 'divorce' THEN 'Divorce'
      WHEN 'annulment' THEN 'Annulment'
      ELSE 'Event'
    END || COALESCE(' - ' || NULLIF(TRIM(e.event_date), ''), '')
  ),
  e.description,
  'family',
  0,
  COALESCE(e.created_at, datetime('now')),
  COALESCE(e.updated_at, datetime('now')),
  NULL,
  NULL
FROM events e;

WITH distinct_places AS (
  SELECT
    MIN(TRIM(event_place)) AS title,
    LOWER(TRIM(event_place)) AS normalized_name,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at,
    ROW_NUMBER() OVER (ORDER BY LOWER(TRIM(event_place))) AS row_number
  FROM events
  WHERE NULLIF(TRIM(event_place), '') IS NOT NULL
  GROUP BY LOWER(TRIM(event_place))
)
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT
  'place_legacy_' || printf('%08d', row_number),
  'place',
  title,
  NULL,
  'family',
  0,
  COALESCE(created_at, datetime('now')),
  COALESCE(updated_at, datetime('now')),
  NULL,
  NULL
FROM distinct_places;

WITH distinct_places AS (
  SELECT
    MIN(TRIM(event_place)) AS title,
    LOWER(TRIM(event_place)) AS normalized_name,
    ROW_NUMBER() OVER (ORDER BY LOWER(TRIM(event_place))) AS row_number
  FROM events
  WHERE NULLIF(TRIM(event_place), '') IS NOT NULL
  GROUP BY LOWER(TRIM(event_place))
)
INSERT OR IGNORE INTO places (id, normalized_name, address_text)
SELECT
  'place_legacy_' || printf('%08d', row_number),
  normalized_name,
  title
FROM distinct_places;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT p.id, ao.title, 'legacy_event_place', 0
FROM places p
INNER JOIN archive_objects ao ON ao.id = p.id;

WITH event_places AS (
  SELECT e.id AS event_id, p.id AS place_id, e.event_date, e.event_date_qualifier
  FROM events e
  INNER JOIN places p ON p.normalized_name = LOWER(TRIM(e.event_place))
  WHERE NULLIF(TRIM(e.event_place), '') IS NOT NULL
)
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT
  'rel_event_place_' || event_id,
  'relationship',
  'Occurred At',
  NULL,
  'family',
  0,
  datetime('now'),
  datetime('now'),
  NULL,
  NULL
FROM event_places;

WITH event_places AS (
  SELECT e.id AS event_id, p.id AS place_id, e.event_date, e.event_date_qualifier
  FROM events e
  INNER JOIN places p ON p.normalized_name = LOWER(TRIM(e.event_place))
  WHERE NULLIF(TRIM(e.event_place), '') IS NOT NULL
)
INSERT OR IGNORE INTO relationships (
  id, relationship_type_id, label, description, date_text, date_start, date_end,
  date_precision, date_qualifier, confidence_level_id, confidence_score, notes
)
SELECT
  'rel_event_place_' || event_id,
  'rel_type_occurred_at',
  'Occurred At',
  NULL,
  event_date,
  NULL,
  NULL,
  NULL,
  event_date_qualifier,
  'confidence_unknown',
  NULL,
  'Backfilled from events.event_place'
FROM event_places;

WITH event_places AS (
  SELECT e.id AS event_id, p.id AS place_id
  FROM events e
  INNER JOIN places p ON p.normalized_name = LOWER(TRIM(e.event_place))
  WHERE NULLIF(TRIM(e.event_place), '') IS NOT NULL
)
INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_place_' || event_id, event_id, 'event', 0
FROM event_places;

WITH event_places AS (
  SELECT e.id AS event_id, p.id AS place_id
  FROM events e
  INNER JOIN places p ON p.normalized_name = LOWER(TRIM(e.event_place))
  WHERE NULLIF(TRIM(e.event_place), '') IS NOT NULL
)
INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_place_' || event_id, place_id, 'place', 1
FROM event_places;
