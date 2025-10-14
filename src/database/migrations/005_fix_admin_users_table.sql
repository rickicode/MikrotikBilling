-- Fix admin_users table structure
-- Add missing permissions column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'admin_users'
        AND column_name = 'permissions'
    ) THEN
        ALTER TABLE admin_users ADD COLUMN permissions JSONB DEFAULT '{}';
        COMMENT ON COLUMN admin_users.permissions IS 'User permissions in JSON format';
    END IF;
END $$;

-- Fix system_logs table if not exists
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) CHECK(level IN ('ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'CRITICAL', 'ALERT')) NOT NULL,
    module VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_module ON system_logs(module);

-- Add default admin user with permissions if not exists
INSERT INTO admin_users (username, password_hash, role, permissions)
SELECT
    'admin',
    '$2b$10$YQZ/ZvqJjkLvKj8UpKNEbuxcELqL7TBCiyop8N8fV5Yb5D8mAWC5W', -- admin123
    'super_admin',
    '{"customers": ["create", "read", "update", "delete"], "vouchers": ["create", "read", "update", "delete"], "pppoe": ["create", "read", "update", "delete"], "profiles": ["create", "read", "update", "delete"], "payments": ["create", "read", "update", "delete"], "settings": ["create", "read", "update"], "reports": ["read"], "admin": ["read", "update"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE username = 'admin');