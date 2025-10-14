-- Initial PostgreSQL Schema for Mikrotik Billing System
-- Simple and efficient design

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled');

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

-- Settings Table
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    type VARCHAR(20) DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers Table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),  -- Using phone instead of nomor_hp
    address TEXT,
    balance DECIMAL(15,2) DEFAULT 0.00,  -- credit_balance
    debt DECIMAL(15,2) DEFAULT 0.00,  -- debt_balance
    is_active BOOLEAN DEFAULT true,  -- status_aktif
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Vouchers Table
CREATE TABLE vouchers (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL DEFAULT '',  -- Batch identifier for voucher grouping
    code VARCHAR(20) UNIQUE NOT NULL,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    price_sell DECIMAL(10,2) NOT NULL,  -- Selling price
    price_cost DECIMAL(10,2) NOT NULL,  -- Cost price
    status VARCHAR(20) DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired', 'disabled')),
    used_at TIMESTAMP,
    expires_at TIMESTAMP,
    duration_hours INTEGER NOT NULL,  -- Duration in hours
    mikrotik_synced BOOLEAN DEFAULT false,  -- Sync status with Mikrotik
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Subscriptions Table
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('hotspot', 'pppoe')),  -- service_type
    service_type VARCHAR(10) NOT NULL CHECK (service_type IN ('hotspot', 'pppoe')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    billing_cycle VARCHAR(20),  -- monthly, weekly, daily, onetime
    next_billing_date DATE,
    auto_renew BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    price DECIMAL(10,2) NOT NULL,
    notes TEXT,
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
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    transaction_id VARCHAR(100),
    notes TEXT,
    payment_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction Logs Table
CREATE TABLE transaction_logs (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,  -- Transaction type: payment, credit, debt adjustment, etc.
    description TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,  -- Can be positive or negative
    balance_before DECIMAL(15,2),  -- Customer balance before transaction
    balance_after DECIMAL(15,2),   -- Customer balance after transaction
    reference_id VARCHAR(100),     -- Reference to related transaction (payment_id, etc.)
    reference_type VARCHAR(50),    -- Type of reference: payment, subscription, etc.
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Notification Queue Table
CREATE TABLE notification_queue (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
    status VARCHAR(20) DEFAULT 'pending',
    send_after TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Sessions Table
CREATE TABLE whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    session_name VARCHAR(50) DEFAULT 'main',
    phone_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected', 'scanning', 'error')),
    qr_code TEXT,
    session_data TEXT,  -- Serialized session data (JSON)
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
    variables JSONB DEFAULT '[]',  -- Array of template variables
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,  -- Default template for category
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

-- Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error Logs Table
CREATE TABLE error_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) DEFAULT 'error',
    message TEXT NOT NULL,
    stack_trace TEXT,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    callback_received BOOLEAN DEFAULT false,
    callback_data JSONB,
    payment_method VARCHAR(50),
    regenerated_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Transactions Table (for detailed transaction tracking)
CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    payment_link_id INTEGER REFERENCES payment_links(id) ON DELETE SET NULL,
    transaction_id VARCHAR(100) UNIQUE,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_data JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled')),
    completed_date TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DuitKu Configuration Table
CREATE TABLE duitku_configurations (
    id SERIAL PRIMARY KEY,
    merchant_code VARCHAR(50) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    environment VARCHAR(20) DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    callback_url VARCHAR(500),
    expiry_hours INTEGER DEFAULT 24,
    max_regenerations INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Roles Table (for extended role management)
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    permissions JSONB DEFAULT '[]',
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, role_name)
);

-- Create indexes for performance
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_vouchers_expires_at ON vouchers(expires_at);
CREATE INDEX idx_vouchers_batch_id ON vouchers(batch_id);
CREATE INDEX idx_vouchers_vendor ON vouchers(vendor_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_pppoe_users_status ON pppoe_users(status);
CREATE INDEX idx_pppoe_users_expires_at ON pppoe_users(expires_at);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_service_type ON subscriptions(service_type);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_vendor ON payments(vendor_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payment_methods_active ON payment_methods(is_active);
CREATE INDEX idx_vendors_active ON vendors(is_active);
CREATE INDEX idx_transaction_logs_customer ON transaction_logs(customer_id);
CREATE INDEX idx_transaction_logs_type ON transaction_logs(type);
CREATE INDEX idx_transaction_logs_created ON transaction_logs(created_at);
CREATE INDEX idx_notifications_status ON notification_queue(status);
CREATE INDEX idx_notifications_send_after ON notification_queue(send_after);
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_recipient ON whatsapp_messages(recipient);
CREATE INDEX idx_whatsapp_templates_category ON whatsapp_templates(category);
CREATE INDEX idx_whatsapp_templates_active ON whatsapp_templates(is_active);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX idx_error_logs_created ON error_logs(created_at);
CREATE INDEX idx_sessions_status ON whatsapp_sessions(status);
CREATE INDEX idx_sessions_phone ON whatsapp_sessions(phone_number);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_payment_links_status ON payment_links(status);
CREATE INDEX idx_payment_links_customer ON payment_links(customer_id);
CREATE INDEX idx_payment_links_invoice ON payment_links(invoice_number);
CREATE INDEX idx_payment_transactions_link ON payment_transactions(payment_link_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_duitku_config_active ON duitku_configurations(is_active);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_active ON user_roles(is_active);

-- Create trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables that have updated_at
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
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_duitku_configurations_updated_at BEFORE UPDATE ON duitku_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment Plugins Table (for plugin management system)
CREATE TABLE payment_plugins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    author VARCHAR(100),
    file_path VARCHAR(500),
    config_schema JSONB,
    is_enabled BOOLEAN DEFAULT true,
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

-- Create indexes for new tables
CREATE INDEX idx_payment_plugins_enabled ON payment_plugins(is_enabled);
CREATE INDEX idx_payment_plugins_name ON payment_plugins(name);
CREATE INDEX idx_plugin_configurations_plugin ON plugin_configurations(plugin_name);
CREATE INDEX idx_plugin_error_logs_plugin ON plugin_error_logs(plugin_name);
CREATE INDEX idx_plugin_error_logs_created ON plugin_error_logs(created_at);

-- Apply trigger to tables that have updated_at
CREATE TRIGGER update_payment_plugins_updated_at BEFORE UPDATE ON payment_plugins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plugin_configurations_updated_at BEFORE UPDATE ON plugin_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;