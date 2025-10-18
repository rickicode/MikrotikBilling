-- 006_performance_optimization.sql
-- Performance improvements with additional indexes and optimizations
-- Created: 2025-10-18
-- Priority: MEDIUM - Performance optimization for production workloads

BEGIN;

-- Customer management composite indexes
CREATE INDEX idx_customers_status_active ON customers(status, is_active);
CREATE INDEX idx_customers_active_balance ON customers(is_active, balance) WHERE is_active = true;
CREATE INDEX idx_customers_phone_active ON customers(phone, is_active) WHERE is_active = true;

-- Payment system composite indexes
CREATE INDEX idx_payments_customer_status ON payments(customer_id, status);
CREATE INDEX idx_payments_status_date ON payments(status, payment_date);
CREATE INDEX idx_payments_customer_date ON payments(customer_id, payment_date) WHERE payment_date IS NOT NULL;
CREATE INDEX idx_payments_method_status ON payments(method, status);

-- Payment links optimization indexes
CREATE INDEX idx_payment_links_status_expiry ON payment_links(status, expiry_date);
CREATE INDEX idx_payment_links_customer_status ON payment_links(customer_id, status);
CREATE INDEX idx_payment_links_created_status ON payment_links(created_at, status);

-- Voucher system composite indexes
CREATE INDEX idx_vouchers_status_expires ON vouchers(status, expires_at);
CREATE INDEX idx_vouchers_batch_status ON vouchers(batch_id, status);
CREATE INDEX idx_vouchers_vendor_status ON vouchers(vendor_id, status);
CREATE INDEX idx_vouchers_customer_status ON vouchers(customer_id, status) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_vouchers_unused_expires ON vouchers(expires_at) WHERE status = 'unused';

-- PPPoE users optimization indexes
CREATE INDEX idx_pppoe_users_customer_status ON pppoe_users(customer_id, status);
CREATE INDEX idx_pppoe_users_status_expires ON pppoe_users(status, expires_at);
CREATE INDEX idx_pppoe_users_profile_status ON pppoe_users(profile_id, status);
CREATE INDEX idx_pppoe_users_active ON pppoe_users(status, expires_at) WHERE status = 'active';

-- Subscription management composite indexes
CREATE INDEX idx_subscriptions_customer_status ON subscriptions(customer_id, status);
CREATE INDEX idx_subscriptions_type_status ON subscriptions(type, status);
CREATE INDEX idx_subscriptions_end_date_status ON subscriptions(end_date, status);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE next_billing_date IS NOT NULL;
CREATE INDEX idx_subscriptions_customer_type ON subscriptions(customer_id, type);

-- Transaction logs optimization
CREATE INDEX idx_transaction_logs_customer_type ON transaction_logs(customer_id, type);
CREATE INDEX idx_transaction_logs_created_type ON transaction_logs(created_at, type);
CREATE INDEX idx_transaction_logs_reference ON transaction_logs(reference_type, reference_id) WHERE reference_id IS NOT NULL;

-- WhatsApp system optimization indexes
CREATE INDEX idx_whatsapp_messages_status_created ON whatsapp_messages(status, created_at);
CREATE INDEX idx_whatsapp_messages_session_status ON whatsapp_messages(session_id, status);
CREATE INDEX idx_whatsapp_sessions_status_activity ON whatsapp_sessions(status, last_activity);
CREATE INDEX idx_whatsapp_templates_category_active ON whatsapp_templates(category, is_active);

-- Notification queue optimization indexes
CREATE INDEX idx_notifications_status_priority ON notification_queue(status, priority);
CREATE INDEX idx_notifications_send_after_priority ON notification_queue(send_after, priority);
CREATE INDEX idx_notifications_channel_status ON notification_queue(channel, status);

-- Profile system indexes
CREATE INDEX idx_profiles_type_active ON profiles(profile_type, is_active);
CREATE INDEX idx_profiles_active_pricing ON profiles(is_active, selling_price) WHERE is_active = true;

-- Activity logs optimization
CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at);
CREATE INDEX idx_activity_logs_action_created ON activity_logs(action, created_at);
CREATE INDEX idx_activity_logs_target ON activity_logs(target_type, target_id) WHERE target_id IS NOT NULL;

-- System logs optimization (from 003_fix_missing_tables)
CREATE INDEX idx_system_logs_level_created ON system_logs(level, created_at);
CREATE INDEX idx_system_logs_module_created ON system_logs(module, created_at);
CREATE INDEX idx_error_logs_level_created ON error_logs(level, created_at);
CREATE INDEX idx_admin_activity_logs_admin_created ON admin_activity_logs(admin_id, created_at);

-- User session optimization indexes
CREATE INDEX idx_user_sessions_user_expires ON user_sessions(user_id, expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(expires_at) WHERE expires_at > CURRENT_TIMESTAMP;

-- Plugin system optimization indexes
CREATE INDEX idx_plugin_configurations_plugin_key ON plugin_configurations(plugin_name, config_key);
CREATE INDEX idx_payment_plugins_enabled_updated ON payment_plugins(is_enabled, updated_at);

-- Location system optimization indexes
CREATE INDEX idx_location_users_location_type ON location_users(location_id, user_type);
CREATE INDEX idx_locations_active_host ON locations(is_active, host) WHERE is_active = true;

-- Backup system optimization indexes
CREATE INDEX idx_backups_type_created ON backups(type, created_at);
CREATE INDEX idx_backup_schedules_active_next ON backup_schedules(is_active, next_run) WHERE is_active = true;

-- Vendor optimization indexes
CREATE INDEX idx_vendors_active_created ON vendors(is_active, created_at) WHERE is_active = true;

-- Partial indexes for common queries (performance optimization)
CREATE INDEX idx_active_customers_balance ON customers(id, balance) WHERE is_active = true AND balance > 0;
CREATE INDEX idx_customers_with_debt ON customers(id, debt) WHERE debt > 0;
CREATE INDEX idx_pending_payments ON payments(id, amount) WHERE status = 'pending';
CREATE INDEX idx_active_subscriptions ON subscriptions(id, end_date) WHERE status = 'active';
CREATE INDEX idx_expired_subscriptions ON subscriptions(id, end_date) WHERE status = 'expired' AND end_date > CURRENT_DATE - INTERVAL '30 days';
CREATE INDEX idx_unused_vouchers_expiring ON vouchers(id, expires_at) WHERE status = 'unused' AND expires_at <= CURRENT_DATE + INTERVAL '7 days';
CREATE INDEX idx_active_pppoe_expiring ON pppoe_users(id, expires_at) WHERE status = 'active' AND expires_at <= CURRENT_DATE + INTERVAL '7 days';
CREATE INDEX idx_failed_notifications ON notification_queue(id, created_at) WHERE status = 'failed';
CREATE INDEX idx_connected_whatsapp_sessions ON whatsapp_sessions(id, last_activity) WHERE status = 'connected';
CREATE INDEX idx_enabled_plugins ON payment_plugins(id, updated_at) WHERE is_enabled = true AND has_error = false;

-- Create functional indexes for common computed queries
CREATE INDEX idx_customers_full_name_lower ON customers(LOWER(name));
CREATE INDEX idx_vouchers_code_lower ON vouchers(LOWER(code));
CREATE INDEX idx_pppoe_users_username_lower ON pppoe_users(LOWER(username));
CREATE INDEX idx_admin_users_username_lower ON admin_users(LOWER(username));

-- Add index for settings lookups
CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_key_category ON settings(key, category);

-- Add indexes for JSONB queries (payment method configurations, plugin settings)
CREATE INDEX idx_payment_methods_config_active ON payment_methods USING GIN(config) WHERE is_active = true;
CREATE INDEX idx_plugin_configurations_value ON plugin_configurations USING GIN(to_jsonb(config_value)) WHERE is_encrypted = false;
CREATE INDEX idx_locations_settings ON locations USING GIN(settings) WHERE is_active = true;

-- Create index for common date range queries
CREATE INDEX idx_payments_date_range ON payments(payment_date DESC) WHERE payment_date IS NOT NULL;
CREATE INDEX idx_subscriptions_end_range ON subscriptions(end_date DESC) WHERE end_date >= CURRENT_DATE;
CREATE INDEX idx_vouchers_expires_range ON vouchers(expires_at DESC) WHERE expires_at >= CURRENT_DATE;

-- Maintenance operations
ANALYZE customers;
ANALYZE payments;
ANALYZE vouchers;
ANALYZE pppoe_users;
ANALYZE subscriptions;
ANALYZE whatsapp_messages;
ANALYZE notification_queue;
ANALYZE activity_logs;
ANALYZE admin_users;
ANALYZE profiles;
ANALYZE locations;

COMMIT;

-- Add comments for optimization tracking
COMMENT ON INDEX idx_customers_status_active ON customers IS 'Composite index for customer status and active status queries';
COMMENT ON INDEX idx_payments_customer_status ON payments IS 'Optimizes payment status lookups per customer';
COMMENT ON INDEX idx_vouchers_status_expires ON vouchers IS 'Optimizes voucher expiry and status queries';
COMMENT ON INDEX idx_subscriptions_end_date_status ON subscriptions IS 'Optimizes subscription end date and status filtering';
COMMENT ON INDEX idx_active_customers_balance ON customers IS 'Partial index for active customers with positive balance';
COMMENT ON INDEX idx_pending_payments ON payments IS 'Partial index for pending payment processing';
COMMENT ON INDEX idx_active_subscriptions ON subscriptions IS 'Partial index for active subscription management';
COMMENT ON INDEX idx_unused_vouchers_expiring ON vouchers IS 'Partial index for voucher expiry notifications';
COMMENT ON INDEX idx_failed_notifications ON notification_queue IS 'Partial index for failed notification retry';
