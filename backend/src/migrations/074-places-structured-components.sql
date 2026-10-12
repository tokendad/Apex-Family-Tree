-- Fill in each place's components and hang it under the place that contains it (#35).
--
-- Migration 068 created these places from the strings events carried, and it
-- had nothing to put in the structured columns, so it left them empty and set
-- address_text to the place's own name for want of anything better. That makes
-- "Worcester, Massachusetts" its own street address, which it is not: an
-- address is where mail arrives. This pass replaces that default with the real
-- division -- locality, county, region, country and postal code in their own
-- columns, address_text holding a street line and nothing else, NULL where no
-- street address is known -- and adds the enclosing place.
--
-- The 68 rows below are a reviewed list, like 068's. Every rule tried against
-- the names mis-parsed something: a trailing "Worcester" is a county after a
-- town and a town after a street, "Camp Devens, Massachusetts" has no locality
-- at all, and "Worcester County Memorial Park" is a cemetery whose name says
-- park. The list is keyed on normalized_name, which is what the row is unique
-- on, and each key was checked against the archive before this was written.
--
-- 17 enclosing places are created because nothing recorded an event in them:
-- Massachusetts was already a place of its own but Cambridge, Paxton and
-- Spencer were not, though cemeteries in all three are. A state with no events
-- of its own is still where its towns are.
--
-- Street addresses come from the archive's owner -- given for four cemeteries,
-- looked up for five institutions and checked against the date of the event
-- that names each one, since an institution's address is only the right one if
-- it was there at the time. Four named places keep NULL on purpose: Camp
-- Devens and Fort Jay are installations rather than buildings and have no
-- street address to hold, and the Donna Kay home and St. Rose Rectory could
-- not be confirmed. NULL is recoverable; a guessed address is not.
--
-- A province is spelt one way in the region column even where the archive
-- spells it two: a place titled "Montréal, Québec, Canada" keeps its title and
-- its alias, but its region reads "Quebec", so grouping by region does not show
-- the province twice. The titles are untouched here -- nothing is renamed.

CREATE TEMP TABLE place_component (
  norm TEXT PRIMARY KEY,
  place_type TEXT,
  address_text TEXT,
  locality TEXT,
  county TEXT,
  region TEXT,
  country TEXT,
  postal_code TEXT,
  parent_norm TEXT
);

CREATE TEMP TABLE place_ancestor (
  norm TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  place_type TEXT,
  locality TEXT,
  region TEXT,
  country TEXT,
  parent_norm TEXT
);

INSERT INTO place_component (norm, place_type, address_text, locality, county, region, country, postal_code, parent_norm) VALUES
  ('1060 main st., worcester, massachusetts', 'address', '1060 Main St.', 'Worcester', NULL, 'Massachusetts', 'United States', NULL, 'worcester, massachusetts'),
  ('11178 culver blvd, apt 15, culver city, california 90230', 'address', '11178 Culver Blvd, Apt 15', 'Culver City', NULL, 'California', 'United States', '90230', 'culver city, california'),
  ('34 shattuck st., worcester, massachusetts', 'address', '34 Shattuck St.', 'Worcester', NULL, 'Massachusetts', 'United States', NULL, 'worcester, massachusetts'),
  ('40 eastern st., allston, massachusetts', 'address', '40 Eastern St.', 'Allston', NULL, 'Massachusetts', 'United States', NULL, 'allston, massachusetts'),
  ('60 crestwood estates, vernon, windham, vermont 05354', 'building', '60 Crestwood Estates', 'Vernon', 'Windham', 'Vermont', 'United States', '05354', 'vernon, vermont'),
  ('714 main st., worcester, massachusetts 01610', 'address', '714 Main St.', 'Worcester', NULL, 'Massachusetts', 'United States', '01610', 'worcester, massachusetts'),
  ('auburn, massachusetts', 'locality', NULL, 'Auburn', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('berthier, quebec, canada', 'locality', NULL, 'Berthier', NULL, 'Quebec', 'Canada', NULL, 'quebec, canada'),
  ('boca raton, florida', 'locality', NULL, 'Boca Raton', NULL, 'Florida', 'United States', NULL, 'florida'),
  ('boston, massachusetts', 'locality', NULL, 'Boston', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('bourne, massachusetts', 'locality', NULL, 'Bourne', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('california', 'region', NULL, NULL, NULL, 'California', 'United States', NULL, 'united states'),
  ('cambridge cemetery, cambridge, massachusetts', 'cemetery', '76 Coolidge Ave', 'Cambridge', NULL, 'Massachusetts', 'United States', '02138', 'cambridge, massachusetts'),
  ('camp devens, massachusetts', 'military', NULL, NULL, NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('canada', 'country', NULL, NULL, NULL, NULL, 'Canada', NULL, NULL),
  ('cottage ave., shrewsbury, massachusetts', 'address', 'Cottage Ave.', 'Shrewsbury', NULL, 'Massachusetts', 'United States', NULL, 'shrewsbury, massachusetts'),
  ('danielsonville, connecticut', 'locality', NULL, 'Danielsonville', NULL, 'Connecticut', 'United States', NULL, 'connecticut'),
  ('donna kay nursing home, worcester, massachusetts', 'nursing_home', NULL, 'Worcester', NULL, 'Massachusetts', 'United States', NULL, 'worcester, massachusetts'),
  ('florida', 'region', NULL, NULL, NULL, 'Florida', 'United States', NULL, 'united states'),
  ('fort jay, governors island, new york', 'military', NULL, 'Governors Island', NULL, 'New York', 'United States', NULL, 'governors island, new york'),
  ('granby, connecticut', 'locality', NULL, 'Granby', NULL, 'Connecticut', 'United States', NULL, 'connecticut'),
  ('granby, quebec, canada', 'locality', NULL, 'Granby', NULL, 'Quebec', 'Canada', NULL, 'quebec, canada'),
  ('hahnemann hospital, worcester, massachusetts', 'hospital', '281 Lincoln St', 'Worcester', NULL, 'Massachusetts', 'United States', '01605', 'worcester, massachusetts'),
  ('holden, massachusetts', 'locality', NULL, 'Holden', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('hollywood, florida', 'locality', NULL, 'Hollywood', NULL, 'Florida', 'United States', NULL, 'florida'),
  ('holy rosary & st. mary cemetery, spencer, massachusetts', 'cemetery', '60 Maple St', 'Spencer', NULL, 'Massachusetts', 'United States', '01562', 'spencer, massachusetts'),
  ('jensen beach, florida', 'locality', NULL, 'Jensen Beach', NULL, 'Florida', 'United States', NULL, 'florida'),
  ('knollwood nursing center, worcester, massachusetts', 'nursing_home', '87 Briarwood Circle', 'Worcester', NULL, 'Massachusetts', 'United States', '01606', 'worcester, massachusetts'),
  ('lakeside avenue, webster, massachusetts', 'address', 'Lakeside Avenue', 'Webster', NULL, 'Massachusetts', 'United States', NULL, 'webster, massachusetts'),
  ('las vegas, nevada', 'locality', NULL, 'Las Vegas', NULL, 'Nevada', 'United States', NULL, 'nevada'),
  ('leicester, massachusetts', 'locality', NULL, 'Leicester', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('leominster, massachusetts', 'locality', NULL, 'Leominster', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('long island, new york', 'locality', NULL, 'Long Island', NULL, 'New York', 'United States', NULL, 'new york'),
  ('marieville, quebec, canada', 'locality', NULL, 'Marieville', NULL, 'Quebec', 'Canada', NULL, 'quebec, canada'),
  ('marlborough, massachusetts', 'locality', NULL, 'Marlborough', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('massachusetts', 'region', NULL, NULL, NULL, 'Massachusetts', 'United States', NULL, 'united states'),
  ('medical center of central massachusetts — hahnemann, worcester, massachusetts', 'hospital', '281 Lincoln St', 'Worcester', NULL, 'Massachusetts', 'United States', '01605', 'worcester, massachusetts'),
  ('milton mills, new hampshire', 'locality', NULL, 'Milton Mills', NULL, 'New Hampshire', 'United States', NULL, 'new hampshire'),
  ('montréal, québec, canada', 'locality', NULL, 'Montréal', NULL, 'Quebec', 'Canada', NULL, 'quebec, canada'),
  ('moser river, nova scotia, canada', 'locality', NULL, 'Moser River', NULL, 'Nova Scotia', 'Canada', NULL, 'nova scotia, canada'),
  ('northborough, massachusetts', 'locality', NULL, 'Northborough', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('northbridge, massachusetts', 'locality', NULL, 'Northbridge', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('nova scotia, canada', 'region', NULL, NULL, NULL, 'Nova Scotia', 'Canada', NULL, 'canada'),
  ('oxford, massachusetts', 'locality', NULL, 'Oxford', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('pout and trout campground, 94 river rd, rutland, massachusetts', 'park', '94 River Rd', 'Rutland', NULL, 'Massachusetts', 'United States', NULL, 'rutland, massachusetts'),
  ('publick house, sturbridge, massachusetts', 'building', '277 Main St', 'Sturbridge', NULL, 'Massachusetts', 'United States', '01566', 'sturbridge, massachusetts'),
  ('putnam, connecticut', 'locality', NULL, 'Putnam', NULL, 'Connecticut', 'United States', NULL, 'connecticut'),
  ('queens, new york', 'locality', NULL, 'Queens', NULL, 'New York', 'United States', NULL, 'new york'),
  ('quinebaug, connecticut', 'locality', NULL, 'Quinebaug', NULL, 'Connecticut', 'United States', NULL, 'connecticut'),
  ('shrewsbury, massachusetts', 'locality', NULL, 'Shrewsbury', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('south carolina', 'region', NULL, NULL, NULL, 'South Carolina', 'United States', NULL, 'united states'),
  ('springfield, massachusetts', 'locality', NULL, 'Springfield', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('st. john''s cemetery, worcester, massachusetts', 'cemetery', '260 Cambridge St', 'Worcester', NULL, 'Massachusetts', 'United States', '01603', 'worcester, massachusetts'),
  ('st. rose rectory, northborough, massachusetts', 'church', NULL, 'Northborough', NULL, 'Massachusetts', 'United States', NULL, 'northborough, massachusetts'),
  ('stickney brook, vermont', 'locality', NULL, 'Stickney Brook', NULL, 'Vermont', 'United States', NULL, 'vermont'),
  ('sturbridge, massachusetts', 'locality', NULL, 'Sturbridge', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('tuell nursing home, 92 franklin st., melrose, massachusetts', 'nursing_home', '92 Franklin St.', 'Melrose', NULL, 'Massachusetts', 'United States', '02176', 'melrose, massachusetts'),
  ('umass memorial medical center — memorial campus, worcester, massachusetts', 'hospital', '119 Belmont St', 'Worcester', NULL, 'Massachusetts', 'United States', '01605', 'worcester, massachusetts'),
  ('uxbridge, massachusetts', 'locality', NULL, 'Uxbridge', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('vernon, vermont', 'locality', NULL, 'Vernon', NULL, 'Vermont', 'United States', NULL, 'vermont'),
  ('ware, massachusetts', 'locality', NULL, 'Ware', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('webster, massachusetts', 'locality', NULL, 'Webster', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('westboro, massachusetts', 'locality', NULL, 'Westboro', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('woonsocket, rhode island', 'locality', NULL, 'Woonsocket', NULL, 'Rhode Island', 'United States', NULL, 'rhode island'),
  ('worcester county memorial park, paxton, massachusetts', 'cemetery', '217 Richards Ave', 'Paxton', NULL, 'Massachusetts', 'United States', '01612', 'paxton, massachusetts'),
  ('worcester, massachusetts', 'locality', NULL, 'Worcester', NULL, 'Massachusetts', 'United States', NULL, 'massachusetts'),
  ('york beach, maine', 'locality', NULL, 'York Beach', NULL, 'Maine', 'United States', NULL, 'maine'),
  ('york, maine', 'locality', NULL, 'York', NULL, 'Maine', 'United States', NULL, 'maine');

INSERT INTO place_ancestor (norm, title, place_type, locality, region, country, parent_norm) VALUES
  ('allston, massachusetts', 'Allston, Massachusetts', 'locality', 'Allston', 'Massachusetts', 'United States', 'massachusetts'),
  ('cambridge, massachusetts', 'Cambridge, Massachusetts', 'locality', 'Cambridge', 'Massachusetts', 'United States', 'massachusetts'),
  ('connecticut', 'Connecticut', 'region', NULL, 'Connecticut', 'United States', 'united states'),
  ('culver city, california', 'Culver City, California', 'locality', 'Culver City', 'California', 'United States', 'california'),
  ('governors island, new york', 'Governors Island, New York', 'locality', 'Governors Island', 'New York', 'United States', 'new york'),
  ('maine', 'Maine', 'region', NULL, 'Maine', 'United States', 'united states'),
  ('melrose, massachusetts', 'Melrose, Massachusetts', 'locality', 'Melrose', 'Massachusetts', 'United States', 'massachusetts'),
  ('nevada', 'Nevada', 'region', NULL, 'Nevada', 'United States', 'united states'),
  ('new hampshire', 'New Hampshire', 'region', NULL, 'New Hampshire', 'United States', 'united states'),
  ('new york', 'New York', 'region', NULL, 'New York', 'United States', 'united states'),
  ('paxton, massachusetts', 'Paxton, Massachusetts', 'locality', 'Paxton', 'Massachusetts', 'United States', 'massachusetts'),
  ('quebec, canada', 'Quebec, Canada', 'region', NULL, 'Quebec', 'Canada', 'canada'),
  ('rhode island', 'Rhode Island', 'region', NULL, 'Rhode Island', 'United States', 'united states'),
  ('rutland, massachusetts', 'Rutland, Massachusetts', 'locality', 'Rutland', 'Massachusetts', 'United States', 'massachusetts'),
  ('spencer, massachusetts', 'Spencer, Massachusetts', 'locality', 'Spencer', 'Massachusetts', 'United States', 'massachusetts'),
  ('united states', 'United States', 'country', NULL, NULL, 'United States', NULL),
  ('vermont', 'Vermont', 'region', NULL, 'Vermont', 'United States', 'united states');

-- Which enclosing places this archive actually needs: the parent of a place
-- that is really here, and then whatever that parent sits in, upwards. Driven
-- by the data and not by the list, the way 068 was -- a database that never
-- recorded an event has no places, and must not be handed seventeen American
-- states it has no use for.
CREATE TEMP TABLE place_ancestor_needed AS
WITH RECURSIVE needed(norm) AS (
  SELECT c.parent_norm
  FROM place_component c
  INNER JOIN places p ON p.normalized_name = c.norm
  WHERE c.parent_norm IS NOT NULL
  UNION
  SELECT a.parent_norm
  FROM place_ancestor a
  INNER JOIN needed n ON n.norm = a.norm
  WHERE a.parent_norm IS NOT NULL
)
SELECT norm FROM needed;

-- Of those, the ones that are not here yet, by name or by alias, so a replay
-- creates nothing twice and a database where one already exists keeps the row
-- it has.
CREATE TEMP TABLE place_ancestor_new AS
SELECT
  a.norm, a.title, a.place_type, a.locality, a.region, a.country,
  'place_chain_' || printf('%08d', ROW_NUMBER() OVER (ORDER BY a.norm)) AS id
FROM place_ancestor a
INNER JOIN place_ancestor_needed d ON d.norm = a.norm
WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.normalized_name = a.norm)
  AND NOT EXISTS (SELECT 1 FROM place_aliases pa WHERE LOWER(TRIM(pa.alias)) = a.norm);

INSERT INTO archive_objects (
  id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at, created_by, updated_by
)
SELECT id, 'place', title, NULL, 'family', 0, datetime('now'), datetime('now'), NULL, NULL
FROM place_ancestor_new;

-- No address_text: a state is not a street.
INSERT INTO places (id, normalized_name, place_type, locality, region, country)
SELECT id, norm, place_type, locality, region, country
FROM place_ancestor_new;

INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order)
SELECT id, title, 'place_chain', 0 FROM place_ancestor_new;

-- The correction proper. address_text stops being the place's own name and
-- becomes the street line or nothing.
UPDATE places SET
  place_type = c.place_type,
  address_text = c.address_text,
  locality = c.locality,
  county = c.county,
  region = c.region,
  country = c.country,
  postal_code = c.postal_code
FROM place_component c
WHERE c.norm = places.normalized_name;

-- The same for an enclosing place that already existed, so it ends up with the
-- components its new siblings got.
UPDATE places SET
  place_type = a.place_type,
  locality = a.locality,
  region = a.region,
  country = a.country
FROM place_ancestor a
WHERE a.norm = places.normalized_name
  AND NOT EXISTS (SELECT 1 FROM place_component c WHERE c.norm = places.normalized_name);

-- Every name used above, resolved to a place id by name or by alias: the
-- parents are written as names, and the row one points at may be older than
-- this migration.
CREATE TEMP TABLE place_chain_edge AS
SELECT norm, parent_norm FROM place_component WHERE parent_norm IS NOT NULL
UNION ALL
SELECT norm, parent_norm FROM place_ancestor WHERE parent_norm IS NOT NULL;

UPDATE places SET parent_place_id = (
  SELECT COALESCE(
    (SELECT p.id FROM places p WHERE p.normalized_name = e.parent_norm),
    (SELECT pa.place_id FROM place_aliases pa
      WHERE LOWER(TRIM(pa.alias)) = e.parent_norm LIMIT 1)
  )
  FROM place_chain_edge e WHERE e.norm = places.normalized_name
)
WHERE normalized_name IN (SELECT norm FROM place_chain_edge);

DROP TABLE place_chain_edge;
DROP TABLE place_ancestor_new;
DROP TABLE place_ancestor_needed;
DROP TABLE place_ancestor;
DROP TABLE place_component;
