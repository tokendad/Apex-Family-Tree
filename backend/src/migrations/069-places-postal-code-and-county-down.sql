-- Remove the postal code and county columns.
ALTER TABLE places DROP COLUMN county;
ALTER TABLE places DROP COLUMN postal_code;
