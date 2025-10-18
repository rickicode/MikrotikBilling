-- 004_add_mikrotik_password_setting.sql
-- Add missing mikrotik_password setting to the settings table
-- Created: 2025-10-16
-- Reason: Password field not saving because mikrotik_password key doesn't exist in settings table

BEGIN;

-- Insert the missing mikrotik_password setting
INSERT INTO settings (key, value, description, type, category) VALUES
('mikrotik_password', '', 'Mikrotik Password', 'string', 'mikrotik')
ON CONFLICT (key) DO NOTHING;

COMMIT;