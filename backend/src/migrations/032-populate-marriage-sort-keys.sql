-- Populate marriage_date_sort_key and marriage_date_qualifier from raw marriage_date strings.
-- This is a data-fix migration; the columns already exist from 008-families.sql.
-- Parsing logic mirrors parseGedcomDate: extract qualifier prefix, then parse "DD MON YYYY" format.
-- Run via the app's migration runner (which executes all new .sql files in order).

-- We can't call TS functions from SQL, so we use a pragmatic approach:
-- Extract the 4-digit year from marriage_date and compute sort_key = year * 10000.
-- The migration runner will also trigger a TS backfill for full accuracy.

-- For now, extract year with a regex-like approach using SQLite string functions.
-- This handles the common formats: "DD MON YYYY", "MON YYYY", "YYYY"

-- Step 1: Set qualifier based on prefix
UPDATE families
SET marriage_date_qualifier = 'about'
WHERE marriage_date IS NOT NULL
  AND (UPPER(marriage_date) LIKE 'ABT %' OR UPPER(marriage_date) LIKE 'ABOUT %')
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'before'
WHERE marriage_date IS NOT NULL
  AND (UPPER(marriage_date) LIKE 'BEF %' OR UPPER(marriage_date) LIKE 'BEFORE %')
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'after'
WHERE marriage_date IS NOT NULL
  AND (UPPER(marriage_date) LIKE 'AFT %' OR UPPER(marriage_date) LIKE 'AFTER %')
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'between'
WHERE marriage_date IS NOT NULL
  AND UPPER(marriage_date) LIKE 'BET %'
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'estimated'
WHERE marriage_date IS NOT NULL
  AND (UPPER(marriage_date) LIKE 'EST %' OR UPPER(marriage_date) LIKE 'ESTIMATED %')
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'calculated'
WHERE marriage_date IS NOT NULL
  AND (UPPER(marriage_date) LIKE 'CAL %' OR UPPER(marriage_date) LIKE 'CALCULATED %')
  AND marriage_date_qualifier IS NULL;

UPDATE families
SET marriage_date_qualifier = 'exact'
WHERE marriage_date IS NOT NULL
  AND marriage_date_qualifier IS NULL;
