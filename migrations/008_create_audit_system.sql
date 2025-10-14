-- 008_create_audit_system.sql

-- Audit logs for data changes
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    user_type VARCHAR(20) DEFAULT 'admin', -- 'admin', 'system', 'api'
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Login attempts
CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(100), -- 'invalid_credentials', 'account_locked', '2fa_failed', etc.
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password reset requests
CREATE TABLE password_reset_requests (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System access logs
CREATE TABLE system_access_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data export logs
CREATE TABLE data_export_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    export_type VARCHAR(50) NOT NULL, -- 'customers', 'payments', 'reports', etc.
    filters JSONB,
    file_path VARCHAR(500),
    record_count INTEGER DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'cancelled'
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration changes
CREATE TABLE configuration_changes (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    change_reason TEXT,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup logs
CREATE TABLE backup_logs (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(50) NOT NULL, -- 'database', 'files', 'full'
    backup_path VARCHAR(500),
    backup_size_bytes BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Security events
CREATE TABLE security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'brute_force', 'sql_injection', 'xss_attempt', 'privilege_escalation'
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    description TEXT NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data retention policies
CREATE TABLE data_retention_policies (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) UNIQUE NOT NULL,
    retention_days INTEGER NOT NULL,
    cleanup_method VARCHAR(20) DEFAULT 'delete', -- 'delete', 'archive'
    is_active BOOLEAN DEFAULT true,
    last_cleanup_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_login_attempts_username ON login_attempts(username);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_success ON login_attempts(success);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);
CREATE INDEX idx_password_reset_requests_token ON password_reset_requests(token);
CREATE INDEX idx_password_reset_requests_admin_id ON password_reset_requests(admin_id);
CREATE INDEX idx_password_reset_requests_is_used ON password_reset_requests(is_used);
CREATE INDEX idx_password_reset_requests_expires_at ON password_reset_requests(expires_at);
CREATE INDEX idx_system_access_logs_user_id ON system_access_logs(user_id);
CREATE INDEX idx_system_access_logs_action ON system_access_logs(action);
CREATE INDEX idx_system_access_logs_resource ON system_access_logs(resource);
CREATE INDEX idx_system_access_logs_session_id ON system_access_logs(session_id);
CREATE INDEX idx_system_access_logs_created_at ON system_access_logs(created_at);
CREATE INDEX idx_data_export_logs_user_id ON data_export_logs(user_id);
CREATE INDEX idx_data_export_logs_type ON data_export_logs(export_type);
CREATE INDEX idx_data_export_logs_status ON data_export_logs(status);
CREATE INDEX idx_data_export_logs_created_at ON data_export_logs(created_at);
CREATE INDEX idx_configuration_changes_setting_key ON configuration_changes(setting_key);
CREATE INDEX idx_configuration_changes_changed_by ON configuration_changes(changed_by);
CREATE INDEX idx_configuration_changes_created_at ON configuration_changes(created_at);
CREATE INDEX idx_backup_logs_type ON backup_logs(backup_type);
CREATE INDEX idx_backup_logs_status ON backup_logs(status);
CREATE INDEX idx_backup_logs_started_at ON backup_logs(started_at);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_ip_address ON security_events(ip_address);
CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_is_resolved ON security_events(is_resolved);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);
CREATE INDEX idx_data_retention_policies_table_name ON data_retention_policies(table_name);
CREATE INDEX idx_data_retention_policies_is_active ON data_retention_policies(is_active);
CREATE INDEX idx_data_retention_policies_last_cleanup ON data_retention_policies(last_cleanup_at);

-- Create triggers for updated_at
CREATE TRIGGER update_data_retention_policies_updated_at
    BEFORE UPDATE ON data_retention_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default data retention policies
INSERT INTO data_retention_policies (table_name, retention_days, cleanup_method, is_active) VALUES
('system_logs', 30, 'delete', true),
('admin_activity_logs', 90, 'delete', true),
('audit_logs', 365, 'delete', true),
('login_attempts', 30, 'delete', true),
('password_reset_requests', 7, 'delete', true),
('system_access_logs', 90, 'delete', true),
('notification_logs', 30, 'delete', true),
('whatsapp_messages', 15, 'delete', true),
('whatsapp_webhook_logs', 7, 'delete', true),
('payment_transactions', 90, 'delete', true),
('plugin_error_logs', 30, 'delete', true),
('hotspot_sessions', 1, 'delete', true),
('pppoe_sessions', 1, 'delete', true),
('voucher_usage_logs', 90, 'delete', true),
('pppoe_user_logs', 90, 'delete', true);