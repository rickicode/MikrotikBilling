-- 002_seed_data.sql
-- Initial seed data for Mikrotik Billing System
-- Created: 2025-10-15

BEGIN;

-- Insert default settings
INSERT INTO settings (key, value, description, type, category) VALUES
('company_name', 'Mikrotik Billing System', 'Company/FiFi Name', 'string', 'general'),
('company_address', 'Jakarta, Indonesia', 'Company Address', 'string', 'general'),
('company_phone', '+6281234567890', 'Company Phone', 'string', 'general'),
('company_email', 'support@mikrotik-billing.com', 'Company Email', 'string', 'general'),
('mikrotik_host', '192.168.1.1', 'Default Mikrotik Host', 'string', 'mikrotik'),
('mikrotik_port', '8728', 'Default Mikrotik API Port', 'number', 'mikrotik'),
('mikrotik_username', 'admin', 'Default Mikrotik Username', 'string', 'mikrotik'),
('mikrotik_timeout', '30000', 'Mikrotik Connection Timeout (ms)', 'number', 'mikrotik'),
('voucher_comment_marker', 'VOUCHER_SYSTEM', 'Comment marker for voucher system', 'string', 'mikrotik'),
('pppoe_comment_marker', 'PPPOE_SYSTEM', 'Comment marker for PPPoE system', 'string', 'mikrotik'),
('session_timeout', '86400000', 'Admin session timeout (ms)', 'number', 'security'),
('rate_limit_window', '900000', 'Rate limit window (ms)', 'number', 'security'),
('rate_limit_max', '100', 'Max requests per window', 'number', 'security'),
('whatsapp_rate_limit', '1000', 'WhatsApp messages per second', 'number', 'whatsapp'),
('backup_path', '/var/backups/mikrotik-billing', 'Default backup path', 'string', 'backup'),
('backup_retention_days', '30', 'Default backup retention in days', 'number', 'backup'),
('cleanup_expired_users', 'true', 'Auto cleanup expired users', 'boolean', 'automation'),
('cleanup_interval_hours', '24', 'Cleanup interval in hours', 'number', 'automation'),
('currency', 'IDR', 'Default currency', 'string', 'general'),
('date_format', 'YYYY-MM-DD', 'Date format', 'string', 'general'),
('time_format', 'HH:mm:ss', 'Time format', 'string', 'general'),
('timezone', 'Asia/Jakarta', 'Default timezone', 'string', 'general')
ON CONFLICT (key) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO admin_users (username, password_hash, email, full_name, role) VALUES
('admin', '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQj', 'admin@mikrotik-billing.com', 'System Administrator', 'super_admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default payment methods
INSERT INTO payment_methods (name, display_name, type, is_active, fee_percentage, fee_fixed) VALUES
('cash', 'Cash', 'manual', true, 0.00, 0.00),
('transfer', 'Bank Transfer', 'manual', true, 0.00, 0.00),
('duitku', 'DuitKu Payment Gateway', 'gateway', false, 2.50, 0.00)
ON CONFLICT (name) DO NOTHING;

-- Insert default vendor
INSERT INTO vendors (name, contact_person, phone, email, is_active) VALUES
('System Vendor', 'System Administrator', '+6281234567890', 'vendor@mikrotik-billing.com', true)
ON CONFLICT DO NOTHING;

-- Insert default WhatsApp templates
INSERT INTO whatsapp_templates (name, category, template_content, variables, is_active, is_default) VALUES
('welcome_hotspot', 'welcome', 'Halo {customer_name},\n\nVoucher hotspot Anda sudah aktif!\n\nKode: {voucher_code}\nPassword: {voucher_password}\nDurasi: {duration_hours} jam\nBerlaku sampai: {expiry_date}\n\nTerima kasih telah menggunakan layanan kami.',
'["customer_name", "voucher_code", "voucher_password", "duration_hours", "expiry_date"]', true, true),
('welcome_pppoe', 'welcome', 'Halo {customer_name},\n\nUser PPPoE Anda sudah aktif!\n\nUsername: {username}\nPassword: {password}\nBerlaku sampai: {expiry_date}\n\nTerima kasih telah menggunakan layanan kami.',
'["customer_name", "username", "password", "expiry_date"]', true, true),
('payment_confirmation', 'payment', 'Halo {customer_name},\n\nPembayaran Anda sebesar Rp {amount} telah kami terima.\n\nMetode: {payment_method}\nTanggal: {payment_date}\n\nTerima kasih atas pembayarannya.',
'["customer_name", "amount", "payment_method", "payment_date"]', true, true),
('expiry_warning', 'expiry', 'Halo {customer_name},\n\nPesan pengingat:\nLayanan {service_type} Anda akan expired dalam {days_remaining} hari.\n\nSilakan lakukan pembayaran perpanjangan untuk menghindari gangguan layanan.\n\nTerima kasih.',
'["customer_name", "service_type", "days_remaining"]', true, true),
('service_expired', 'expiry', 'Halo {customer_name},\n\nLayanan {service_type} Anda telah expired.\n\nSilakan lakukan pembayaran perpanjangan untuk mengaktifkan kembali layanan Anda.\n\nTerima kasih.',
'["customer_name", "service_type"]', true, true),
('service_renewed', 'renewal', 'Halo {customer_name},\n\nLayanan {service_type} Anda telah diperpanjang.\n\nPeriode: {start_date} - {end_date}\n\nTerima kasih atas kepercayaan Anda.',
'["customer_name", "service_type", "start_date", "end_date"]', true, true)
ON CONFLICT (name, category) DO NOTHING;

-- Insert default backup schedule
INSERT INTO backup_schedules (name, frequency, retention_days, is_active) VALUES
('daily_backup', 'daily', 7, true),
('weekly_backup', 'weekly', 4, true),
('monthly_backup', 'monthly', 12, true)
ON CONFLICT (name) DO NOTHING;

-- Insert default location (if applicable)
INSERT INTO locations (name, host, port, username, password, is_active, settings) VALUES
('Main Office', '192.168.1.1', 8728, 'admin', 'password', true, '{"timezone": "Asia/Jakarta", "description": "Main Mikrotik Router"}')
ON CONFLICT (name) DO NOTHING;

COMMIT;