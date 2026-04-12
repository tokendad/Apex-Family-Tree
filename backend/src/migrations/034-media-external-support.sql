-- Add is_external flag to distinguish pre-existing (scanned) vs uploaded media
ALTER TABLE media_items ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0;

-- Unique index on file_path to prevent duplicate scan entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_file_path ON media_items(file_path);
