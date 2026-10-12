-- Populate the places table from the event_place strings already in the archive.
--
-- Migration 046 created the places tables and a backfill alongside them, but it
-- ran before this archive had any events: the family data was imported
-- afterwards, so 046 found nothing to copy and places has stood empty while 182
-- events carried their location as loose text. Nothing has written a place row
-- since, because nothing in the application did -- that is issue #34, and the
-- repository wiring that ships with this migration is the other half of it.
--
-- The mapping below is a reviewed list, not a rule. Its 72 places were collapsed
-- by hand from the 82 distinct spellings in this archive, because every
-- automatic rule tried against the data merged something it should not have:
-- dropping the part before the state turns "Hahnemann Hospital, Worcester,
-- Massachusetts" into a hospital in no particular town, and rewriting the
-- "Putnam. Ct" typo by splitting on a period also splits "St. John's Cemetery"
-- and collides it with "St. Rose Rectory". Canonical names carry neither the
-- country nor the county.
--
-- Every spelling folded away is kept as an alias, so the text anyone has ever
-- typed still resolves to the place -- which is what stops the duplicates coming
-- straight back the next time somebody records an event in Worcester.

CREATE TEMP TABLE place_map (raw TEXT PRIMARY KEY, canonical TEXT NOT NULL);

INSERT INTO place_map (raw, canonical) VALUES
  ('1060 Main St., Worcester, Massachusetts', '1060 Main St., Worcester, Massachusetts'),
  ('11178 Culver Blvd, Apt 15, Culver City, California 90230', '11178 Culver Blvd, Apt 15, Culver City, California 90230'),
  ('34 Shattuck St., Worcester, Massachusetts', '34 Shattuck St., Worcester, Massachusetts'),
  ('40 Eastern St., Allston, Massachusetts', '40 Eastern St., Allston, Massachusetts'),
  ('60 Crestwood Estates, Vernon, Windham, Vermont 05354', '60 Crestwood Estates, Vernon, Windham, Vermont 05354'),
  ('714 Main St., Worcester, Massachusetts 01610', '714 Main St., Worcester, Massachusetts 01610'),
  ('Auburn, Massachusetts', 'Auburn, Massachusetts'),
  ('Auburn, Worcester, Massachusetts', 'Auburn, Massachusetts'),
  ('Berthier, Quebec, Canada', 'Berthier, Quebec, Canada'),
  ('Boca Raton, Florida', 'Boca Raton, Florida'),
  ('Boston, Massachusetts', 'Boston, Massachusetts'),
  ('Boston, Suffolk, Massachusetts', 'Boston, Massachusetts'),
  ('Bourne, Massachusetts', 'Bourne, Massachusetts'),
  ('Bourne, Massachusetts, USA', 'Bourne, Massachusetts'),
  ('California', 'California'),
  ('Cambridge Cemetery, Cambridge, Massachusetts', 'Cambridge Cemetery, Cambridge, Massachusetts'),
  ('Camp Devens, Massachusetts', 'Camp Devens, Massachusetts'),
  ('Canada', 'Canada'),
  ('Cottage Ave., Shrewsbury, Massachusetts', 'Cottage Ave., Shrewsbury, Massachusetts'),
  ('Cottage Ave., Shrewsbury, Worcester, Massachusetts', 'Cottage Ave., Shrewsbury, Massachusetts'),
  ('Danielsonville, Connecticut', 'Danielsonville, Connecticut'),
  ('Danielsonville, Connecticut, USA', 'Danielsonville, Connecticut'),
  ('Donna Kay Nursing Home, Worcester, Massachusetts', 'Donna Kay Nursing Home, Worcester, Massachusetts'),
  ('Florida', 'Florida'),
  ('Florida, USA', 'Florida'),
  ('Fort Jay, Governors Island, New York', 'Fort Jay, Governors Island, New York'),
  ('French Canada', 'French Canada'),
  ('Granby, Connecticut', 'Granby, Connecticut'),
  ('Granby, Hartford, Connecticut, USA', 'Granby, Connecticut'),
  ('Granby, Quebec, Canada', 'Granby, Quebec, Canada'),
  ('Hahnemann Hospital, Worcester, Massachusetts', 'Hahnemann Hospital, Worcester, Massachusetts'),
  ('Holden, Massachusetts', 'Holden, Massachusetts'),
  ('Holden, Worcester, Massachusetts', 'Holden, Massachusetts'),
  ('Hollywood, Florida', 'Hollywood, Florida'),
  ('Holy Rosary & St. Mary Cemetery, Spencer, Massachusetts', 'Holy Rosary & St. Mary Cemetery, Spencer, Massachusetts'),
  ('Holy Rosary & St. Mary Cemetery, Spencer, Worcester, Massachusetts', 'Holy Rosary & St. Mary Cemetery, Spencer, Massachusetts'),
  ('Jensen Beach, Florida', 'Jensen Beach, Florida'),
  ('Jensen Beach, Florida, USA', 'Jensen Beach, Florida'),
  ('Knollwood Nursing Center, Worcester, Massachusetts', 'Knollwood Nursing Center, Worcester, Massachusetts'),
  ('Lakeside Avenue, Webster, Massachusetts', 'Lakeside Avenue, Webster, Massachusetts'),
  ('Las Vegas, Clark, Nevada', 'Las Vegas, Nevada'),
  ('Las Vegas, Nevada', 'Las Vegas, Nevada'),
  ('Leicester, Massachusetts', 'Leicester, Massachusetts'),
  ('Leicester, Massachusetts, USA', 'Leicester, Massachusetts'),
  ('Leominster, Massachusetts', 'Leominster, Massachusetts'),
  ('Leominster, Worcester, Massachusetts', 'Leominster, Massachusetts'),
  ('Long Island, New York', 'Long Island, New York'),
  ('Marieville, Quebec, Canada', 'Marieville, Quebec, Canada'),
  ('Marieville, Saint-Hyacinthe, Quebec, Canada', 'Marieville, Quebec, Canada'),
  ('Marlborough, Massachusetts', 'Marlborough, Massachusetts'),
  ('Massachusetts', 'Massachusetts'),
  ('Massachusetts, United States', 'Massachusetts'),
  ('Medical Center of Central Massachusetts — Hahnemann, Worcester, Massachusetts', 'Medical Center of Central Massachusetts — Hahnemann, Worcester, Massachusetts'),
  ('Milton Mills, New Hampshire', 'Milton Mills, New Hampshire'),
  ('Milton Mills, Strafford, New Hampshire, USA', 'Milton Mills, New Hampshire'),
  ('Montréal, Québec, Canada', 'Montréal, Québec, Canada'),
  ('Moser River, Nova Scotia, Canada', 'Moser River, Nova Scotia, Canada'),
  ('Northborough, Massachusetts', 'Northborough, Massachusetts'),
  ('Northborough, Worcester, Massachusetts', 'Northborough, Massachusetts'),
  ('Northbridge, Massachusetts', 'Northbridge, Massachusetts'),
  ('Northbridge, Worcester, Massachusetts', 'Northbridge, Massachusetts'),
  ('Nova Scotia, Canada', 'Nova Scotia, Canada'),
  ('Oxford, Massachusetts', 'Oxford, Massachusetts'),
  ('Pout and Trout Campground, 94 River Rd, Rutland, Massachusetts', 'Pout and Trout Campground, 94 River Rd, Rutland, Massachusetts'),
  ('Publick House, Sturbridge, Massachusetts', 'Publick House, Sturbridge, Massachusetts'),
  ('Publick House, Sturbridge, Worcester, Massachusetts', 'Publick House, Sturbridge, Massachusetts'),
  ('Putnam, Connecticut', 'Putnam, Connecticut'),
  ('Putnam, Windham, Connecticut, USA', 'Putnam, Connecticut'),
  ('Putnam. Ct', 'Putnam, Connecticut'),
  ('Queens, New York', 'Queens, New York'),
  ('Queens, Queens, New York', 'Queens, New York'),
  ('Quinebaug, Connecticut', 'Quinebaug, Connecticut'),
  ('Shrewsbury, Massachusetts', 'Shrewsbury, Massachusetts'),
  ('Shrewsbury, Worcester, Massachusetts', 'Shrewsbury, Massachusetts'),
  ('South Carolina', 'South Carolina'),
  ('South Carolina, USA', 'South Carolina'),
  ('Springfield, Hampden, Massachusetts', 'Springfield, Massachusetts'),
  ('Springfield, Massachusetts', 'Springfield, Massachusetts'),
  ('St. John''s Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, Massachusetts', 'St. John''s Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, Massachusetts'),
  ('St. John''s Cemetery, Worcester, Massachusetts', 'St. John''s Cemetery, Worcester, Massachusetts'),
  ('St. Rose Rectory, Northborough, Massachusetts', 'St. Rose Rectory, Northborough, Massachusetts'),
  ('St. Rose Rectory, Northborough, Worcester, Massachusetts', 'St. Rose Rectory, Northborough, Massachusetts'),
  ('Stickney Brook, Vermont', 'Stickney Brook, Vermont'),
  ('Stickney Brook, Windham, Vermont', 'Stickney Brook, Vermont'),
  ('Sturbridge, Massachusetts', 'Sturbridge, Massachusetts'),
  ('Sturbridge, Massachusetts, USA', 'Sturbridge, Massachusetts'),
  ('Tuell Nursing Home, 92 Franklin St., Melrose, Massachusetts', 'Tuell Nursing Home, 92 Franklin St., Melrose, Massachusetts'),
  ('UMass Memorial Medical Center — Memorial Campus, Worcester, Massachusetts', 'UMass Memorial Medical Center — Memorial Campus, Worcester, Massachusetts'),
  ('Uxbridge, Massachusetts', 'Uxbridge, Massachusetts'),
  ('Uxbridge, Worcester, Massachusetts', 'Uxbridge, Massachusetts'),
  ('Vernon, Vermont', 'Vernon, Vermont'),
  ('Ware, Massachusetts', 'Ware, Massachusetts'),
  ('Ware, Massachusetts, USA', 'Ware, Massachusetts'),
  ('Webster, Massachusetts', 'Webster, Massachusetts'),
  ('Webster, Massachusetts, USA', 'Webster, Massachusetts'),
  ('Westboro, Massachusetts', 'Westboro, Massachusetts'),
  ('Westboro, Worcester, Massachusetts', 'Westboro, Massachusetts'),
  ('Woonsocket, Rhode Island', 'Woonsocket, Rhode Island'),
  ('Woonsocket, Rhode Island, USA', 'Woonsocket, Rhode Island'),
  ('Worcester County Memorial Park, Garden of Heritage I, Lot 237 Grave 4, Paxton, Massachusetts', 'Worcester County Memorial Park, Garden of Heritage I, Lot 237 Grave 4, Paxton, Massachusetts'),
  ('Worcester County Memorial Park, Garden of Heritage I, Lot 303A space 4, Paxton, Massachusetts', 'Worcester County Memorial Park, Garden of Heritage I, Lot 303A space 4, Paxton, Massachusetts'),
  ('Worcester County Memorial Park, Paxton, Massachusetts', 'Worcester County Memorial Park, Paxton, Massachusetts'),
  ('Worcester County Memorial Park, Paxton, Worcester, Massachusetts', 'Worcester County Memorial Park, Paxton, Massachusetts'),
  ('Worcester, MA', 'Worcester, Massachusetts'),
  ('Worcester, Massachusetts', 'Worcester, Massachusetts'),
  ('Worcester, Massachusetts, USA', 'Worcester, Massachusetts'),
  ('Worcester, Worcester, Massachusetts', 'Worcester, Massachusetts'),
  ('Worcester, Worcester, Massachusetts, USA', 'Worcester, Massachusetts'),
  ('York Beach, Maine', 'York Beach, Maine'),
  ('York Beach, York, Maine', 'York Beach, Maine'),
  ('York, Maine', 'York, Maine');

-- Driven by the events, not by the list: an event added between the review and
-- this migration keeps its own spelling as its own place rather than being
-- dropped, and a fresh database with no events gets no places at all.
CREATE TEMP TABLE place_resolved AS
SELECT DISTINCT
  TRIM(e.event_place) AS raw,
  COALESCE(m.canonical, TRIM(e.event_place)) AS canonical
FROM events e
LEFT JOIN place_map m ON m.raw = TRIM(e.event_place)
WHERE NULLIF(TRIM(e.event_place), '') IS NOT NULL;

-- Only the canonicals that have no place yet, by name or by alias. A database
-- where 046 did find data keeps the rows it made.
CREATE TEMP TABLE place_ids AS
SELECT
  canonical,
  'place_backfill_' || printf('%08d', ROW_NUMBER() OVER (ORDER BY canonical)) AS id
FROM (
  SELECT DISTINCT r.canonical
  FROM place_resolved r
  WHERE NOT EXISTS (
    SELECT 1 FROM places p WHERE p.normalized_name = LOWER(TRIM(r.canonical))
  )
  AND NOT EXISTS (
    SELECT 1 FROM place_aliases pa WHERE LOWER(TRIM(pa.alias)) = LOWER(TRIM(r.canonical))
  )
);

INSERT INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT id, 'place', canonical, NULL, 'family', 0, datetime('now'), datetime('now'), NULL, NULL
FROM place_ids;

INSERT INTO places (id, normalized_name, address_text)
SELECT id, LOWER(TRIM(canonical)), canonical
FROM place_ids;

-- The canonical name first, then every spelling that was folded into it.
INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT id, canonical, 'legacy_event_place', 0 FROM place_ids;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT i.id, r.raw, 'legacy_event_place', 1
FROM place_resolved r
INNER JOIN place_ids i ON i.canonical = r.canonical
WHERE r.raw <> r.canonical;

-- Resolve each spelling to its place, whether created just now or already here.
CREATE TEMP TABLE place_lookup AS
SELECT
  r.raw,
  COALESCE(
    (SELECT p.id FROM places p WHERE p.normalized_name = LOWER(TRIM(r.canonical))),
    (SELECT pa.place_id FROM place_aliases pa
      WHERE LOWER(TRIM(pa.alias)) = LOWER(TRIM(r.canonical)) LIMIT 1)
  ) AS place_id
FROM place_resolved r;

-- One "occurred at" edge per event, with the id form 046 established and the
-- application code now reuses, so an event can never collect two of them.
INSERT OR IGNORE INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT 'rel_event_place_' || e.id, 'relationship', 'Occurred At', NULL, 'family', 0,
       datetime('now'), datetime('now'), NULL, NULL
FROM events e
INNER JOIN place_lookup l ON l.raw = TRIM(e.event_place)
WHERE l.place_id IS NOT NULL;

-- No date is copied onto the edge: the event owns its date, and a second copy
-- would be one more thing to keep in step on every edit.
INSERT OR IGNORE INTO relationships (
  id, relationship_type_id, label, description, date_text, date_start, date_end,
  date_precision, date_qualifier, confidence_level_id, confidence_score, notes
)
SELECT 'rel_event_place_' || e.id, 'rel_type_occurred_at', 'Occurred At', NULL, NULL, NULL, NULL,
       NULL, NULL, 'confidence_unknown', NULL, 'Backfilled by migration 068'
FROM events e
INNER JOIN place_lookup l ON l.raw = TRIM(e.event_place)
WHERE l.place_id IS NOT NULL;

INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_place_' || e.id, e.id, 'event', 0
FROM events e
INNER JOIN place_lookup l ON l.raw = TRIM(e.event_place)
WHERE l.place_id IS NOT NULL;

INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
SELECT 'rel_event_place_' || e.id, l.place_id, 'place', 1
FROM events e
INNER JOIN place_lookup l ON l.raw = TRIM(e.event_place)
WHERE l.place_id IS NOT NULL;

DROP TABLE place_lookup;
DROP TABLE place_ids;
DROP TABLE place_resolved;
DROP TABLE place_map;
