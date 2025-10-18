-- 003_fix_missing_tables.sql
-- Fix missing tables that are referenced in the code
-- Created: 2025-10-15

BEGIN;

-- System Logs Table (replaces the missing system_logs)
CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) CHECK(level IN ('ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'CRITICAL', 'ALERT')) NOT NULL,
    module VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error Logs Table (for DataRetentionService)
CREATE TABLE error_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) DEFAULT 'error',
    message TEXT NOT NULL,
    stack_trace TEXT,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Activity Logs Table (additional tracking)
CREATE TABLE admin_activity_logs (
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

-- Create indexes for new tables
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_module ON system_logs(module);
CREATE INDEX idx_system_logs_created ON system_logs(created_at);
CREATE INDEX idx_system_logs_user ON system_logs(user_id);

CREATE INDEX idx_error_logs_level ON error_logs(level);
CREATE INDEX idx_error_logs_created ON error_logs(created_at);
CREATE INDEX idx_error_logs_user ON error_logs(user_id);

CREATE INDEX idx_admin_activity_logs_admin ON admin_activity_logs(admin_id);
CREATE INDEX idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX idx_admin_activity_logs_created ON admin_activity_logs(created_at);

-- Apply updated_at triggers
CREATE TRIGGER update_system_logs_updated_at BEFORE UPDATE ON system_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_error_logs_updated_at BEFORE UPDATE ON error_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_activity_logs_updated_at BEFORE UPDATE ON admin_activity_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;