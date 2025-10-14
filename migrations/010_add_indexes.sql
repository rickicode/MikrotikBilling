-- 010_add_indexes.sql

-- Create composite indexes for performance optimization

-- Customers composite indexes
CREATE INDEX idx_customers_nama_status ON customers(nama, status_aktif);
CREATE INDEX idx_customers_phone_status ON customers(nomor_hp, status_aktif);
CREATE INDEX idx_customers_credit_debt ON customers(credit_balance, debt_balance);
CREATE INDEX idx_customers_created_status ON customers(created_at, status_aktif);

-- Vouchers composite indexes
CREATE INDEX idx_vouchers_status_expires ON vouchers(is_used, expires_at);
CREATE INDEX idx_vouchers_customer_status ON vouchers(customer_id, is_used);
CREATE INDEX idx_vouchers_created_status ON vouchers(created_at, is_used);
CREATE INDEX idx_vouchers_profile_created ON vouchers(profile_id, created_at);

-- PPPoE users composite indexes
CREATE INDEX idx_pppoe_users_status_expires ON pppoe_users(is_active, expires_at);
CREATE INDEX idx_pppoe_users_customer_status ON pppoe_users(customer_id, is_active);
CREATE INDEX idx_pppoe_users_profile_status ON pppoe_users(profile_id, is_active);
CREATE INDEX idx_pppoe_users_created_status ON pppoe_users_users(created_at, is_active);

-- Subscriptions composite indexes
CREATE INDEX idx_subscriptions_customer_status ON subscriptions(customer_id, is_active);
CREATE INDEX idx_subscriptions_type_status ON subscriptions(subscription_type_id, is_active);
CREATE INDEX idx_subscriptions_expires_status ON subscriptions(expires_at, is_active);
CREATE INDEX idx_subscriptions_next_billing_status ON subscriptions(next_billing_at, is_active);
CREATE INDEX idx_subscriptions_customer_type ON subscriptions(customer_id, subscription_type_id);

-- Invoices composite indexes
CREATE INDEX idx_invoices_customer_status ON invoices(customer_id, status);
CREATE INDEX idx_invoices_status_created ON invoices(status, created_at);
CREATE INDEX idx_invoices_customer_created ON invoices(customer_id, created_at);
CREATE INDEX idx_invoices_due_status ON invoices(due_date, status);

-- Payments composite indexes
CREATE INDEX idx_payments_status_created ON payments(status, created_at);
CREATE INDEX idx_payments_method_status ON payments(payment_method, status);
CREATE INDEX idx_payments_invoice_status ON payments(invoice_id, status);
CREATE INDEX idx_payments_created_processed ON payments(created_at, processed_at);
CREATE INDEX idx_payments_reference_method ON payments(payment_reference, payment_method);

-- Sessions composite indexes
CREATE INDEX idx_hotspot_sessions_active_last_seen ON hotspot_sessions(is_active, last_seen);
CREATE INDEX idx_hotspot_sessions_ip_active ON hotspot_sessions(ip_address, is_active);
CREATE INDEX idx_pppoe_sessions_active_last_seen ON pppoe_sessions(is_active, last_seen);
CREATE INDEX idx_pppoe_sessions_username_active ON pppoe_sessions(username, is_active);

-- WhatsApp composite indexes
CREATE INDEX idx_whatsapp_sessions_active_priority ON whatsapp_sessions(is_active, priority);
CREATE INDEX idx_whatsapp_sessions_status_priority ON whatsapp_sessions(status, priority);
CREATE INDEX idx_whatsapp_messages_session_created ON whatsapp_messages(session_id, created_at);
CREATE INDEX idx_whatsapp_messages_type_status ON whatsapp_messages(message_type, status);
CREATE INDEX idx_whatsapp_queues_status_retry ON whatsapp_message_queues(status, retry_count);
CREATE INDEX idx_whatsapp_queues_session_priority ON whatsapp_message_queues(session_id, priority);

-- Notification composite indexes
CREATE INDEX idx_notification_logs_status_created ON notification_logs(status, created_at);
CREATE INDEX idx_notification_logs_channel_status ON notification_logs(channel_id, status);
CREATE INDEX idx_notification_queue_status_priority ON notification_queue(status, priority);
CREATE INDEX idx_notification_queue_channel_created ON notification_queue(channel_id, created_at);

-- System logs composite indexes
CREATE INDEX idx_system_logs_level_module ON system_logs(level, module);
CREATE INDEX idx_system_logs_module_created ON system_logs(module, created_at);
CREATE INDEX idx_system_logs_user_created ON system_logs(user_id, created_at);

-- Activity logs composite indexes
CREATE INDEX idx_activity_logs_admin_action ON admin_activity_logs(admin_id, action);
CREATE INDEX idx_activity_logs_action_created ON admin_activity_logs(action, created_at);
CREATE INDEX idx_activity_logs_target_created ON admin_activity_logs(target_type, target_id, created_at);

-- Plugin composite indexes
CREATE INDEX idx_plugin_logs_plugin_created ON plugin_error_logs(plugin_name, created_at);
CREATE INDEX idx_plugin_logs_type_created ON plugin_error_logs(error_type, created_at);
CREATE INDEX idx_payment_plugins_status_installed ON payment_plugins(status, installed_at);
CREATE INDEX idx_payment_methods_active_sort ON payment_methods(is_active, sort_order);

-- Billing composite indexes
CREATE INDEX idx_subscription_billings_subscription_status ON subscription_billings(subscription_id, status);
CREATE INDEX idx_subscription_billings_period_status ON subscription_billings(billing_period_start, status);
CREATE INDEX idx_subscription_billings_due_status ON subscription_billings(due_date, status);

-- Usage composite indexes
CREATE INDEX idx_subscription_usage_subscription_type ON subscription_usage(subscription_id, usage_type);
CREATE INDEX idx_subscription_usage_date_type ON subscription_usage(date, usage_type);

-- Statistics composite indexes
CREATE INDEX idx_whatsapp_session_stats_session_date ON whatsapp_session_stats(session_id, date);
CREATE INDEX idx_notification_stats_channel_date ON notification_stats(channel_id, date);
CREATE INDEX idx_pppoe_user_stats_user_date ON pppoe_user_stats(user_id, date);

-- Settings composite indexes
CREATE INDEX idx_settings_key_updated ON settings(key, updated_at);

-- Carry over composite indexes
CREATE INDEX idx_carry_over_customer_usage ON carry_over_balances(customer_id, is_used);
CREATE INDEX idx_carry_over_subscription_usage ON carry_over_balances(subscription_id, is_used);
CREATE INDEX idx_carry_over_expires_usage ON carry_over_balances(expires_at, is_used);

-- Queue composite indexes
CREATE INDEX idx_whatsapp_queues_queue_status_priority ON whatsapp_message_queues(queue_name, status, priority);
CREATE INDEX idx_notification_queue_channel_status_priority ON notification_queue(channel_id, status, priority);

-- Performance indexes for common queries
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('indonesian', nama || ' ' || nomor_hp));
CREATE INDEX idx_vouchers_search ON vouchers USING gin(to_tsvector('simple', kode));
CREATE INDEX idx_pppoe_users_search ON pppoe_users USING gin(to_tsvector('simple', username));
CREATE INDEX idx_system_logs_search ON system_logs USING gin(to_tsvector('simple', message));

-- Partial indexes for better performance
CREATE INDEX idx_active_vouchers_expires ON vouchers(expires_at) WHERE is_used = false;
CREATE INDEX idx_active_pppoe_users_expires ON pppoe_users(expires_at) WHERE is_active = true;
CREATE INDEX idx_active_subscriptions_expires ON subscriptions(expires_at) WHERE is_active = true;
CREATE INDEX idx_pending_payments_created ON payments(created_at) WHERE status = 'pending';
CREATE INDEX idx_pending_invoices_due ON invoices(due_date) WHERE status = 'pending';
CREATE INDEX idx_unread_notifications_created ON notification_logs(created_at) WHERE status = 'pending';
CREATE INDEX idx_failed_whatsapp_messages_created ON whatsapp_messages(created_at) WHERE status = 'failed';
CREATE INDEX idx_failed_whatsapp_queues_created ON whatsapp_message_queues(created_at) WHERE status = 'failed';

-- Create function to update search vectors
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    -- This function would be implemented for each table that needs full-text search
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;