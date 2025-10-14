-- Migration 002: Add Default Data
-- Insert initial data for the system

BEGIN;

-- Insert default settings
INSERT INTO settings (key, value, description, type, category) VALUES
('company_name', 'Mikrotik Billing System', 'Company Name', 'string', 'company'),
('company_address', '', 'Company Address', 'string', 'company'),
('company_phone', '', 'Company Phone', 'string', 'company'),
('company_email', '', 'Company Email', 'string', 'company'),
('mikrotik_host', '192.168.1.1', 'Mikrotik IP Address', 'string', 'mikrotik'),
('mikrotik_port', '8728', 'Mikrotik API Port', 'number', 'mikrotik'),
('mikrotik_username', 'admin', 'Mikrotik Username', 'string', 'mikrotik'),
('mikrotik_password', '', 'Mikrotik Password', 'string', 'mikrotik'),
('wifi_name', 'WiFi', 'WiFi Network Name', 'string', 'wifi'),
('hotspot_url', 'login.hotspot', 'Hotspot Login URL', 'string', 'wifi'),
('currency', 'IDR', 'Default Currency', 'string', 'general'),
('currency_symbol', 'Rp', 'Currency Symbol', 'string', 'general'),
('system_timezone', 'Asia/Jakarta', 'System Timezone', 'string', 'system'),
('system_date_format', 'DD/MM/YYYY', 'Date Format', 'string', 'system'),
('theme_color', '#ec4899', 'Theme Color', 'string', 'ui');

-- Default admin user (password: admin123)
INSERT INTO admin_users (username, password_hash, email, full_name, role) VALUES
('admin', '$2b$10$CwTycUXWue0Thq9StjUM0uJ6QGwFUvKyRHGDBe.xjQzV8K4.ABC1C', 'admin@example.com', 'System Administrator', 'super_admin');

-- Default vendor
INSERT INTO vendors (name, contact_person, phone, email) VALUES
('Default Vendor', 'System Administrator', '', 'vendor@example.com');

-- Default payment methods
INSERT INTO payment_methods (name, display_name, type, is_active) VALUES
('cash', 'Cash', 'manual', true),
('transfer', 'Bank Transfer', 'manual', true),
('duitku', 'DuitKu', 'gateway', false);

COMMIT;