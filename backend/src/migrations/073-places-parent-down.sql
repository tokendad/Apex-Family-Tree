-- Remove places.parent_place_id.
--
-- A rebuild and not a DROP COLUMN: SQLite refuses to drop a column that
-- carries a REFERENCES clause, so the table is recreated without it. The
-- column list is written out in full rather than SELECT *, because the order
-- here has to be the order the surviving columns are in.
--
-- Foreign keys off for the rebuild, which is SQLite's own recipe and not a
-- formality here: place_aliases references places(id) ON DELETE CASCADE, and
-- with enforcement on, dropping the old table takes every alias with it. The
-- migrator runs forward migrations with them off already, but a rollback file
-- is run by hand, so it says so itself.

PRAGMA foreign_keys = OFF;

CREATE TABLE _places_no_parent (
  id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL UNIQUE,
  place_type TEXT,
  address_text TEXT,
  locality TEXT,
  region TEXT,
  country TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  county TEXT,
  postal_code TEXT
);

INSERT INTO _places_no_parent (
  id, normalized_name, place_type, address_text, locality, region, country,
  latitude, longitude, notes, county, postal_code
)
SELECT
  id, normalized_name, place_type, address_text, locality, region, country,
  latitude, longitude, notes, county, postal_code
FROM places;

DROP TABLE places;
ALTER TABLE _places_no_parent RENAME TO places;

CREATE INDEX IF NOT EXISTS idx_places_normalized_name ON places(normalized_name);
CREATE INDEX IF NOT EXISTS idx_places_locality ON places(locality);

PRAGMA foreign_keys = ON;
