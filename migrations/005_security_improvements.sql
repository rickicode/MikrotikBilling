-- 005_security_improvements.sql
-- Security improvements and business rule validation
-- Created: 2025-10-18
-- Priority: HIGH - Security fixes for production readiness

BEGIN;

-- Email validation constraint removed for authentication flexibility
-- Admin users can authenticate without strict email validation

-- Add password strength constraint (bcrypt hash length validation)
ALTER TABLE admin_users 
ADD CONSTRAINT chk_admin_password_strength 
CHECK (length(password_hash) >= 60);

-- Email and phone validation constraints removed for authentication flexibility
-- Customers can be managed without strict email/phone validation requirements
-- This allows more flexible user management and authentication approaches

-- Add balance and debt validation (non-negative)
ALTER TABLE customers 
ADD CONSTRAINT chk_balance_debt_valid 
CHECK (balance >= 0 AND debt >= 0);

-- Add pricing validation for vouchers
ALTER TABLE vouchers 
ADD CONSTRAINT chk_voucher_pricing_valid 
CHECK (price_sell >= 0 AND price_cost >= 0 AND price_sell >= price_cost);

-- Add pricing validation for profiles
ALTER TABLE profiles 
ADD CONSTRAINT chk_profile_pricing_valid 
CHECK (selling_price >= 0 AND cost_price >= 0 AND selling_price >= cost_price);

-- Add payment amount validation
ALTER TABLE payments 
ADD CONSTRAINT chk_payment_amount_positive 
CHECK (amount > 0);

-- Add payment link amount validation
ALTER TABLE payment_links 
ADD CONSTRAINT chk_payment_link_amount_positive 
CHECK (amount > 0);

-- Add setting type validation
ALTER TABLE settings 
ADD CONSTRAINT chk_setting_type_valid 
CHECK (type IN ('string', 'number', 'boolean', 'json'));

-- Add notification priority range validation
ALTER TABLE notification_queue 
ADD CONSTRAINT chk_notification_priority_range 
CHECK (priority >= 0 AND priority <= 10);

-- Add session expiry validation
ALTER TABLE user_sessions 
ADD CONSTRAINT chk_session_expiry_future 
CHECK (expires_at > created_at);

-- Add mikrotik port validation
ALTER TABLE settings 
ADD CONSTRAINT chk_mikrotik_port_valid 
CHECK (key != 'mikrotik_port' OR (value ~* '^[0-9]+$' AND value::integer BETWEEN 1 AND 65535));

-- Add timeout validation for numeric settings
ALTER TABLE settings 
ADD CONSTRAINT chk_timeout_values_positive 
CHECK (
    key NOT IN ('mikrotik_timeout', 'session_timeout', 'rate_limit_window', 'whatsapp_rate_limit') 
    OR (value ~* '^[0-9]+$' AND value::integer > 0)
);

-- Add username format validation for admin users
ALTER TABLE admin_users 
ADD CONSTRAINT chk_admin_username_format 
CHECK (username ~* '^[a-zA-Z0-9_-]+$' AND length(username) >= 3);

-- Add username format validation for PPPoE users
ALTER TABLE pppoe_users 
ADD CONSTRAINT chk_pppoe_username_format 
CHECK (username ~* '^[a-zA-Z0-9_-]+$' AND length(username) >= 3);

-- Add voucher code format validation
ALTER TABLE vouchers 
ADD CONSTRAINT chk_voucher_code_format 
CHECK (code ~* '^[A-Z0-9]+$' AND length(code) >= 4);

-- Add Mikrotik connection validation in settings
UPDATE settings 
SET value = '[SETUP_REQUIRED]' 
WHERE key = 'mikrotik_password' AND (value IS NULL OR value = '');

-- Add location validation
ALTER TABLE locations 
ADD CONSTRAINT chk_location_host_format 
CHECK (host ~* '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$');

ALTER TABLE locations 
ADD CONSTRAINT chk_location_port_valid 
CHECK (port BETWEEN 1 AND 65535);

-- Add Mikrotik name format validation for profiles
ALTER TABLE profiles 
ADD CONSTRAINT chk_profile_mikrotik_name_format 
CHECK (mikrotik_name IS NULL OR length(mikrotik_name) >= 1);

-- Add duration validation for profiles
ALTER TABLE profiles 
ADD CONSTRAINT chk_profile_duration_positive 
CHECK (duration_hours > 0);

-- Add duration validation for vouchers
ALTER TABLE vouchers 
ADD CONSTRAINT chk_voucher_duration_positive 
CHECK (duration_hours > 0);

-- Add subscription date validation
ALTER TABLE subscriptions 
ADD CONSTRAINT chk_subscription_dates_valid 
CHECK (end_date >= start_date);

-- Add subscription next billing date validation
ALTER TABLE subscriptions 
ADD CONSTRAINT chk_subscription_next_billing_valid 
CHECK (next_billing_date IS NULL OR next_billing_date >= end_date);

-- Add payment link expiry validation
ALTER TABLE payment_links 
ADD CONSTRAINT chk_payment_link_expiry_future 
CHECK (expiry_date IS NULL OR expiry_date > created_at);

-- Add Mikrotik connection settings validation
INSERT INTO settings (key, value, description, type, category) VALUES
('mikrotik_ssl', 'false', 'Use SSL for Mikrotik connection', 'boolean', 'mikrotik'),
('mikrotik_connection_timeout', '30000', 'Mikrotik connection timeout in milliseconds', 'number', 'mikrotik'),
('mikrotik_max_retries', '3', 'Maximum connection retry attempts', 'number', 'mikrotik')
ON CONFLICT (key) DO NOTHING;

-- Add security settings
INSERT INTO settings (key, value, description, type, category) VALUES
('password_min_length', '8', 'Minimum password length for admin users', 'number', 'security'),
('session_timeout_warning', '300000', 'Session timeout warning in milliseconds', 'number', 'security'),
('max_login_attempts', '5', 'Maximum failed login attempts before lockout', 'number', 'security'),
('lockout_duration', '900000', 'Account lockout duration in milliseconds', 'number', 'security')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Add helpful comments for future reference
COMMENT ON CONSTRAINT chk_admin_password_strength ON admin_users IS 'Ensures bcrypt hash meets minimum length requirements';
-- Email and phone validation constraints removed for authentication flexibility
COMMENT ON CONSTRAINT chk_balance_debt_valid ON customers IS 'Ensures balance and debt are never negative';
COMMENT ON CONSTRAINT chk_voucher_pricing_valid ON vouchers IS 'Ensures selling price is not less than cost price';
COMMENT ON CONSTRAINT chk_session_expiry_future ON user_sessions IS 'Ensures session expiry is after creation time';
COMMENT ON CONSTRAINT chk_mikrotik_port_valid ON settings IS 'Validates Mikrotik port is in valid range';
