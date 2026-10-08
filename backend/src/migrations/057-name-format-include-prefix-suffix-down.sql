-- Revert the default name display format to first/middle/surname only.
UPDATE app_settings
   SET value = '%f %m %s',
       updated_at = datetime('now')
 WHERE key = 'name_display_format'
   AND value = '%t %f %m %s %x';
