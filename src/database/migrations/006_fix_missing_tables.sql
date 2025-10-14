-- Fix missing tables and columns for proper functionality
-- This migration addresses issues found in the error logs

-- Create admin_activity_logs table if not exists
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for admin_activity_logs
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON admin_activity_logs(action);

-- Fix customers table status_aktif column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customers'
        AND column_name = 'status_aktif'
    ) THEN
        ALTER TABLE customers ADD COLUMN status_aktif BOOLEAN DEFAULT true;
        COMMENT ON COLUMN customers.status_aktif IS 'Customer active status';
    END IF;
END $$;

-- Ensure all required tables exist with proper structure
-- Fix payments table status column if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payments'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE payments ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
        COMMENT ON COLUMN payments.status IS 'Payment status: pending, paid, failed, cancelled';
    END IF;
END $$;

-- Fix subscriptions table status column if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions'
        AND column_name = 'status'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        COMMENT ON COLUMN subscriptions.status IS 'Subscription status: active, expired, cancelled';
    END IF;
END $$;

-- Update admin_users table permissions if they are NULL
UPDATE admin_users
SET permissions = '{"customers": ["create", "read", "update", "delete"], "vouchers": ["create", "read", "update", "delete"], "pppoe": ["create", "read", "update", "delete"], "profiles": ["create", "read", "update", "delete"], "payments": ["create", "read", "update", "delete"], "settings": ["create", "read", "update"], "reports": ["read"], "admin": ["read", "update"]}'::jsonb
WHERE permissions IS NULL OR permissions = '{}'::jsonb;

-- Insert system configuration if settings table is empty
INSERT INTO settings (key, value, description)
SELECT
    'company_name',
    'HIJINETWORK Mikrotik Billing',
    'Company name displayed in the application'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'company_name');

INSERT INTO settings (key, value, description)
SELECT
    'default_currency',
    'IDR',
    'Default currency for payments'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'default_currency');

INSERT INTO settings (key, value, description)
SELECT
    'timezone',
    'Asia/Jakarta',
    'Application timezone'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'timezone');

-- Create error_logs table if not exists (for global error handler)
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) DEFAULT 'ERROR',
    message TEXT NOT NULL,
    stack_trace TEXT,
    details JSONB,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    path VARCHAR(500),
    method VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for error_logs
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);

-- Create activity_logs table if not exists (for general activity tracking)
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

COMMENT ON TABLE admin_activity_logs IS 'Tracks admin user actions for audit trail';
COMMENT ON TABLE activity_logs IS 'General activity logging for all user actions';
COMMENT ON TABLE error_logs IS 'Error logging for debugging and monitoring';