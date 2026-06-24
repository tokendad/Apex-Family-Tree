-- AFT Name Display System — Add middle_name, nickname to names table and display_name to persons
-- Migration: 038

-- Add new fields to names table
ALTER TABLE names ADD COLUMN middle_name TEXT;
ALTER TABLE names ADD COLUMN nickname TEXT;

-- Add display_name override to persons table
ALTER TABLE persons ADD COLUMN display_name TEXT;

-- Add indexes for new fields (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_names_middle_name ON names(middle_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_names_nickname ON names(nickname COLLATE NOCASE);

-- Add name_display_format setting to app_settings
INSERT OR IGNORE INTO app_settings (key, value, value_type, description) VALUES
  ('name_display_format', '%f %m %s', 'string', 'Global name display format using tokens: %f (first), %m (middle), %mi (middle initial), %s (surname), %ms (married surname), %t (title/prefix), %n (nickname), %x (suffix)');
