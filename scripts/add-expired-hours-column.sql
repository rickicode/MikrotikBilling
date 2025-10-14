-- Add missing expired_hours column to vouchers table
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS expired_hours INTEGER DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN vouchers.expired_hours IS 'Expiration time in hours after first login (0 = never expires)';

-- Update existing records to have a default value
UPDATE vouchers SET expired_hours = 0 WHERE expired_hours IS NULL;