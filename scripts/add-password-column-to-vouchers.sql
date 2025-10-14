-- Add missing password column to vouchers table
-- This column is needed for the sync functionality

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- Add comment to document the column
COMMENT ON COLUMN vouchers.password IS 'Password for voucher user (stored from Mikrotik)';

-- Update existing vouchers to have default passwords if needed
UPDATE vouchers SET password = substring(code, 1, 8) WHERE password IS NULL AND code IS NOT NULL;