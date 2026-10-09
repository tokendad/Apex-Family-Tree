-- Include title and suffix in the default name display format.
--
-- 038 seeded '%f %m %s', which drops %t (title/prefix) and %x (suffix). A
-- father and son recorded as "Raymond Earl LeFort Sr" and "Raymond Earl LeFort
-- Jr" therefore rendered identically everywhere a formatted name appears,
-- making two distinct people look like one duplicate.
--
-- Only rewrite the value when it is still the seeded default; an instance that
-- has deliberately customised its format keeps that choice.
UPDATE app_settings
   SET value = '%t %f %m %s %x',
       updated_at = datetime('now')
 WHERE key = 'name_display_format'
   AND value = '%f %m %s';
