-- 001_initial_schema.sql
-- Complete schema for Mikrotik Billing System
-- Created: 2025-10-15
-- Version: 1.0.0

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for better data integrity
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled');
CREATE TYPE subscription_type AS ENUM ('hotspot', 'pppoe');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'weekly', 'daily', 'onetime');
CREATE TYPE whatsapp_status AS ENUM ('disconnected', 'connecting', 'connected', 'scanning', 'error');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- Create function for automatic updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. CORE ADMIN TABLES

-- Admin Users Table
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'operator')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Settings Table
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    type VARCHAR(20) DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CUSTOMER MANAGEMENT TABLES

-- Customers Table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    balance DECIMAL(15,2) DEFAULT 0.00,
    debt DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction Logs Table
CREATE TABLE transaction_logs (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    reference_id VARCHAR(100),
    reference_type VARCHAR(50),
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. MIKROTIK PROFILES AND SERVICES

-- Profiles Table (Mikrotik Profiles)
CREATE TABLE profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    profile_type VARCHAR(10) NOT NULL CHECK (profile_type IN ('hotspot', 'pppoe')),
    cost_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    speed_limit VARCHAR(50),
    data_limit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    mikrotik_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. VOUCHER SYSTEM

-- Vendors Table
CREATE TABLE vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers Table
CREATE TABLE vouchers (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL DEFAULT '',
    code VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    price_sell DECIMAL(10,2) NOT NULL,
    price_cost DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired', 'disabled')),
    used_at TIMESTAMP,
    expires_at TIMESTAMP,
    duration_hours INTEGER NOT NULL,
    mikrotik_synced BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. PPPoE USER MANAGEMENT

-- PPPoE Users Table
CREATE TABLE pppoe_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    status user_status DEFAULT 'active',
    expires_at TIMESTAMP,
    mikrotik_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUBSCRIPTION MANAGEMENT

-- Subscriptions Table
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    type subscription_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    billing_cycle billing_cycle,
    next_billing_date DATE,
    auto_renew BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. PAYMENT SYSTEM

-- Payment Methods Table
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('gateway', 'manual', 'wallet')),
    is_active BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    fee_percentage DECIMAL(5,2) DEFAULT 0.00,
    fee_fixed DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    method VARCHAR(50) DEFAULT 'cash',
    status payment_status DEFAULT 'pending',
    transaction_id VARCHAR(100),
    notes TEXT,
    payment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Links Table (for payment gateway integration)
CREATE TABLE payment_links (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    payment_url VARCHAR(500),
    expiry_date TIMESTAMP,
    duitku_reference VARCHAR(100),
    status payment_status DEFAULT 'pending',
    callback_received BOOLEAN DEFAULT false,
    callback_data JSONB,
    payment_method VARCHAR(50),
    regenerated_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. WHATSAPP NOTIFICATION SYSTEM

-- WhatsApp Sessions Table
CREATE TABLE whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    session_name VARCHAR(50) DEFAULT 'main',
    phone_number VARCHAR(20),
    status whatsapp_status DEFAULT 'disconnected',
    qr_code TEXT,
    session_data TEXT,
    priority INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Templates Table
CREATE TABLE whatsapp_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    template_content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, category)
);

-- WhatsApp Messages Table
CREATE TABLE whatsapp_messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES whatsapp_sessions(session_id) ON DELETE CASCADE,
    message_id VARCHAR(100),
    recipient VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. NOTIFICATION QUEUE

-- Notification Queue Table
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    status notification_status DEFAULT 'pending',
    send_after TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. USER SESSIONS

-- User Sessions Table (for authentication)
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. PLUGIN SYSTEM

-- Payment Plugins Table
CREATE TABLE payment_plugins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    file_path VARCHAR(500),
    config_schema JSONB,
    is_enabled BOOLEAN DEFAULT true,
    has_error BOOLEAN DEFAULT false,
    error_message TEXT,
    installed_by INTEGER REFERENCES admin_users(id),
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plugin Configurations Table
CREATE TABLE plugin_configurations (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES payment_plugins(name) ON DELETE CASCADE,
    UNIQUE(plugin_name, config_key)
);

-- Plugin Error Logs Table
CREATE TABLE plugin_error_logs (
    id SERIAL PRIMARY KEY,
    plugin_name VARCHAR(100) NOT NULL,
    error_type VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plugin_name) REFERENCES payment_plugins(name) ON DELETE CASCADE
);

-- 12. BACKUP SYSTEM

-- Backups Table
CREATE TABLE backups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    location VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup Schedules Table
CREATE TABLE backup_schedules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. MULTI-LOCATION SUPPORT

-- Locations Table
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 8728,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Location Users Table
CREATE TABLE location_users (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    user_id INTEGER,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('hotspot', 'pppoe', 'customer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location_id, user_id, user_type)
);

-- 14. CREATE INDEXES FOR PERFORMANCE

-- Core tables indexes
CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_active ON admin_users(is_active);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);

-- Customer indexes
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_active ON customers(is_active);

-- Transaction indexes
CREATE INDEX idx_transaction_logs_customer ON transaction_logs(customer_id);
CREATE INDEX idx_transaction_logs_type ON transaction_logs(type);
CREATE INDEX idx_transaction_logs_created ON transaction_logs(created_at);

-- Profile indexes
CREATE INDEX idx_profiles_type ON profiles(profile_type);
CREATE INDEX idx_profiles_active ON profiles(is_active);

-- Voucher indexes
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_vouchers_expires_at ON vouchers(expires_at);
CREATE INDEX idx_vouchers_batch_id ON vouchers(batch_id);
CREATE INDEX idx_vouchers_vendor ON vouchers(vendor_id);
CREATE INDEX idx_vouchers_code ON vouchers(code);

-- PPPoE indexes
CREATE INDEX idx_pppoe_users_status ON pppoe_users(status);
CREATE INDEX idx_pppoe_users_expires_at ON pppoe_users(expires_at);
CREATE INDEX idx_pppoe_users_customer ON pppoe_users(customer_id);

-- Subscription indexes
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_type ON subscriptions(type);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

-- Payment indexes
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_vendor ON payments(vendor_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_subscription ON payments(subscription_id);

-- Payment methods indexes
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active);

-- Payment links indexes
CREATE INDEX idx_payment_links_status ON payment_links(status);
CREATE INDEX idx_payment_links_customer ON payment_links(customer_id);
CREATE INDEX idx_payment_links_invoice ON payment_links(invoice_number);
CREATE INDEX idx_payment_links_expiry ON payment_links(expiry_date);

-- Notification indexes
CREATE INDEX idx_notifications_status ON notification_queue(status);
CREATE INDEX idx_notifications_send_after ON notification_queue(send_after);
CREATE INDEX idx_notifications_priority ON notification_queue(priority);

-- WhatsApp indexes
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_recipient ON whatsapp_messages(recipient);
CREATE INDEX idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE INDEX idx_whatsapp_templates_active ON whatsapp_templates(is_active);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(status);
CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone_number);
CREATE INDEX idx_whatsapp_sessions_activity ON whatsapp_sessions(last_activity);

-- User session indexes
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Plugin indexes
CREATE INDEX idx_payment_plugins_enabled ON payment_plugins(is_enabled);
CREATE INDEX idx_payment_plugins_name ON payment_plugins(name);
CREATE INDEX idx_plugin_configurations_plugin ON plugin_configurations(plugin_name);
CREATE INDEX idx_plugin_error_logs_plugin ON plugin_error_logs(plugin_name);
CREATE INDEX idx_plugin_error_logs_created ON plugin_error_logs(created_at);

-- Backup indexes
CREATE INDEX idx_backups_type ON backups(type);
CREATE INDEX idx_backups_status ON backups(status);
CREATE INDEX idx_backups_created ON backups(created_at);
CREATE INDEX idx_backup_schedules_active ON backup_schedules(is_active);
CREATE INDEX idx_backup_schedules_next_run ON backup_schedules(next_run);

-- Location indexes
CREATE INDEX idx_locations_active ON locations(is_active);
CREATE INDEX idx_location_users_location ON location_users(location_id);
CREATE INDEX idx_location_users_user ON location_users(user_id);

-- Vendor indexes
CREATE INDEX idx_vendors_active ON vendors(is_active);

-- 15. CREATE TRIGGERS FOR UPDATED_AT

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_sessions_updated_at BEFORE UPDATE ON whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_queue_updated_at BEFORE UPDATE ON notification_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pppoe_users_updated_at BEFORE UPDATE ON pppoe_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_plugins_updated_at BEFORE UPDATE ON payment_plugins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plugin_configurations_updated_at BEFORE UPDATE ON plugin_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_backup_schedules_updated_at BEFORE UPDATE ON backup_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;