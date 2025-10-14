# Database Schema v2.0 - PostgreSQL Migration

## 1. Migration Strategy

### 1.1 Migration Files Structure

```
migrations/
├── 001_create_initial_schema.sql      # Base tables
├── 002_create_voucher_system.sql      # Voucher management
├── 003_create_pppoe_system.sql        # PPPoE management
├── 004_create_payment_system.sql      # Payment gateway
├── 005_create_subscription_system.sql # Subscriptions
├── 006_create_whatsapp_system.sql     # WhatsApp integration
├── 007_create_notification_system.sql # Notifications
├── 008_create_audit_system.sql        # Audit trails
├── 009_create_plugin_system.sql       # Plugin management
└── 010_add_indexes.sql                # Performance indexes
```

### 1.2 Migration Runner

```javascript
// migration-runner.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor(pool) {
    this.pool = pool;
  }

  async run() {
    // Create migration table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get migration files
    const migrationFiles = fs.readdirSync('./migrations')
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run pending migrations
    for (const file of migrationFiles) {
      const executed = await this.pool.query(
        'SELECT id FROM migrations WHERE filename = $1',
        [file]
      );

      if (executed.rows.length === 0) {
        console.log(`Running migration: ${file}`);

        const sql = fs.readFileSync(
          path.join('./migrations', file),
          'utf8'
        );

        await this.pool.query('BEGIN');
        try {
          await this.pool.query(sql);
          await this.pool.query(
            'INSERT INTO migrations (filename) VALUES ($1)',
            [file]
          );
          await this.pool.query('COMMIT');
          console.log(`✅ Migration ${file} completed`);
        } catch (error) {
          await this.pool.query('ROLLBACK');
          console.error(`❌ Migration ${file} failed:`, error);
          throw error;
        }
      }
    }
  }
}
```

## 2. Core Tables Schema

### 2.1 Migration 001: Initial Schema

```sql
-- 001_create_initial_schema.sql

-- Admin users table
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'operator')),
  permissions JSONB DEFAULT '{}',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  nomor_hp VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  status_aktif BOOLEAN DEFAULT true,
  credit_balance DECIMAL(10,2) DEFAULT 0,
  debt_balance DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System logs table
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

-- Activity logs table
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

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Migration 002: Voucher System

```sql
-- 002_create_voucher_system.sql

-- Vendors table
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  contact_person VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Voucher batches table
CREATE TABLE voucher_batches (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(50) UNIQUE NOT NULL,
  profile_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  total_revenue DECIMAL(10,2) NOT NULL,
  vendor_id INTEGER DEFAULT 1 REFERENCES vendors(id),
  created_by INTEGER NOT NULL REFERENCES admin_users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers table
CREATE TABLE vouchers (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(50) NOT NULL REFERENCES voucher_batches(batch_id),
  voucher_code VARCHAR(50) UNIQUE NOT NULL,
  profile_id INTEGER NOT NULL,
  price_sell DECIMAL(10,2) NOT NULL,
  price_cost DECIMAL(10,2) NOT NULL,
  duration_hours INTEGER NOT NULL,
  expired_hours INTEGER NOT NULL DEFAULT 0,
  never_expired BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'available' CHECK(status IN ('available', 'active', 'used', 'expired')),
  first_login TIMESTAMP,
  expires_at TIMESTAMP,
  mikrotik_id VARCHAR(50),
  mikrotik_synced BOOLEAN DEFAULT false,
  vendor_id INTEGER DEFAULT 1 REFERENCES vendors(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Voucher usage tracking
CREATE TABLE voucher_usage (
  id SERIAL PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  username VARCHAR(100),
  ip_address INET,
  session_start TIMESTAMP,
  session_end TIMESTAMP,
  bytes_used BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create triggers
CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voucher_batches_updated_at
    BEFORE UPDATE ON voucher_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON vouchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.3 Migration 003: PPPoE System

```sql
-- 003_create_pppoe_system.sql

-- PPPoE users table
CREATE TABLE pppoe_users (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  price_sell DECIMAL(10,2) NOT NULL,
  price_cost DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'expired')),
  mikrotik_name VARCHAR(100),
  mikrotik_id VARCHAR(50),
  mikrotik_synced BOOLEAN DEFAULT false,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PPPoE usage logs table
CREATE TABLE pppoe_usage_logs (
  id SERIAL PRIMARY KEY,
  pppoe_user_id INTEGER NOT NULL REFERENCES pppoe_users(id) ON DELETE CASCADE,
  session_start TIMESTAMP NOT NULL,
  session_end TIMESTAMP,
  bytes_in BIGINT DEFAULT 0,
  bytes_out BIGINT DEFAULT 0,
  ip_address INET,
  calling_station_id VARCHAR(50),
  session_duration INTEGER, -- in seconds
  termination_cause VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger
CREATE TRIGGER update_pppoe_users_updated_at
    BEFORE UPDATE ON pppoe_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.4 Migration 004: Payment System

```sql
-- 004_create_payment_system.sql

-- Payment plugins table
CREATE TABLE payment_plugins (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  version VARCHAR(20) NOT NULL,
  description TEXT,
  author VARCHAR(255),
  file_path VARCHAR(500),
  config_schema JSONB,
  is_active BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false, -- System plugins cannot be deleted
  fee_config JSONB DEFAULT '{"fixed": 0, "percentage": 0}',
  supported_methods JSONB DEFAULT '[]',
  last_updated TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment methods table (dynamic based on active plugins)
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  plugin_id INTEGER REFERENCES payment_plugins(id) ON DELETE CASCADE,
  method_code VARCHAR(50) NOT NULL,
  method_name VARCHAR(255) NOT NULL,
  method_type VARCHAR(50) CHECK(method_type IN ('online', 'offline', 'manual')),
  icon_url VARCHAR(500),
  fee_type VARCHAR(20) CHECK(fee_type IN ('fixed', 'percentage', 'both')),
  fee_amount DECIMAL(10,2) DEFAULT 0,
  fee_percentage DECIMAL(5,2) DEFAULT 0,
  min_amount DECIMAL(10,2),
  max_amount DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_id, method_code)
);

-- Payments table
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  subscription_id INTEGER,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) GENERATED ALWAYS AS (amount + fee_amount) STORED,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK(payment_status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded')),
  external_reference VARCHAR(255), -- Reference from payment gateway
  callback_data JSONB,
  notes TEXT,
  paid_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment links table
CREATE TABLE payment_links (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  link_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  link_url VARCHAR(500),
  qr_code TEXT, -- Base64 encoded QR image
  click_count INTEGER DEFAULT 0,
  last_clicked TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Create triggers
CREATE TRIGGER update_payment_plugins_updated_at
    BEFORE UPDATE ON payment_plugins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.5 Migration 005: Subscription System

```sql
-- 005_create_subscription_system.sql

-- Subscriptions table
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type VARCHAR(20) CHECK(service_type IN ('hotspot', 'pppoe')) NOT NULL,
  profile_id INTEGER NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  price_sell DECIMAL(10,2) NOT NULL,
  price_cost DECIMAL(10,2) NOT NULL,
  billing_cycle VARCHAR(20) CHECK(billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')) NOT NULL,
  cycle_type VARCHAR(20) DEFAULT 'duration_based' CHECK(cycle_type IN ('duration_based', 'date_based')),
  duration_days INTEGER,
  billing_day INTEGER, -- For date-based billing (1-31)
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'expired', 'suspended')),
  auto_renew BOOLEAN DEFAULT false,
  last_billing_date DATE,
  next_billing_date DATE,
  mikrotik_synced BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription invoices table
CREATE TABLE subscription_invoices (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) GENERATED ALWAYS AS (amount + tax_amount - discount_amount) STORED,
  status VARCHAR(20) DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'paid', 'overdue', 'cancelled', 'refunded')),
  due_date DATE NOT NULL,
  paid_date DATE,
  payment_id INTEGER REFERENCES payments(id),
  carry_over_amount DECIMAL(10,2) DEFAULT 0, -- Amount carried from previous period
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_invoices_updated_at
    BEFORE UPDATE ON subscription_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.6 Migration 006: WhatsApp System

```sql
-- 006_create_whatsapp_system.sql

-- WhatsApp sessions table
CREATE TABLE whatsapp_sessions (
  id SERIAL PRIMARY KEY,
  session_name VARCHAR(100) DEFAULT 'main',
  session_data TEXT, -- Encrypted session data
  qr_code TEXT, -- Base64 encoded QR
  status VARCHAR(20) DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'connected', 'scanning', 'error')),
  phone_number VARCHAR(20),
  device_name VARCHAR(255),
  last_activity TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_name)
);

-- WhatsApp messages table
CREATE TABLE whatsapp_messages (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  session_name VARCHAR(100) DEFAULT 'main',
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  message_type VARCHAR(20) DEFAULT 'outgoing' CHECK(message_type IN ('outgoing', 'incoming')),
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  related_id INTEGER,
  related_type VARCHAR(50) CHECK(related_type IN ('customer', 'subscription', 'payment', 'voucher', 'general')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  template_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp templates table
CREATE TABLE whatsapp_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50) DEFAULT 'general' CHECK(category IN ('notification', 'payment', 'reminder', 'marketing', 'general')),
  template_content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create triggers
CREATE TRIGGER update_whatsapp_sessions_updated_at
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at
    BEFORE UPDATE ON whatsapp_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_templates_updated_at
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.7 Migration 007: Notification System

```sql
-- 007_create_notification_system.sql

-- Notification queue table
CREATE TABLE notification_queue (
  id SERIAL PRIMARY KEY,
  queue_name VARCHAR(50) DEFAULT 'default',
  priority INTEGER DEFAULT 0, -- Higher number = higher priority
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification logs table
CREATE TABLE notification_logs (
  id SERIAL PRIMARY KEY,
  queue_id INTEGER REFERENCES notification_queue(id),
  type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  response JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.8 Migration 008: Audit System

```sql
-- 008_create_audit_system.sql

-- Financial transactions log
CREATE TABLE financial_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(50) NOT NULL, -- payment, refund, adjustment, carry_over
  reference_type VARCHAR(50) NOT NULL, -- invoice, payment, subscription
  reference_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),
  description TEXT,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data change log (for audit trail)
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id INTEGER NOT NULL,
  operation VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  changed_fields JSONB,
  user_id INTEGER REFERENCES admin_users(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to create audit trigger
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (
            table_name, record_id, operation, old_values,
            user_id, ip_address
        ) VALUES (
            TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD),
            current_setting('app.current_user_id')::INTEGER,
            current_setting('app.client_ip')::INET
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (
            table_name, record_id, operation, old_values, new_values,
            changed_fields, user_id, ip_address
        ) VALUES (
            TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW),
            (
                SELECT json_object_agg(key, value)
                FROM jsonb_each_text(row_to_json(NEW))
                WHERE NOT (row_to_json(NEW)->>key = row_to_json(OLD)->>key)
            ),
            current_setting('app.current_user_id')::INTEGER,
            current_setting('app.client_ip')::INET
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (
            table_name, record_id, operation, new_values,
            user_id, ip_address
        ) VALUES (
            TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW),
            current_setting('app.current_user_id')::INTEGER,
            current_setting('app.client_ip')::INET
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### 2.9 Migration 009: Plugin System

```sql
-- 009_create_plugin_system.sql

-- Plugin registry table
CREATE TABLE plugin_registry (
  id SERIAL PRIMARY KEY,
  plugin_type VARCHAR(50) NOT NULL, -- payment, notification, auth, etc.
  name VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  author VARCHAR(255),
  website VARCHAR(500),
  file_hash VARCHAR(64), -- SHA256 hash for integrity
  dependencies JSONB DEFAULT '[]',
  config_schema JSONB,
  is_active BOOLEAN DEFAULT false,
  install_date TIMESTAMP,
  last_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_type, name)
);

-- Plugin configurations table
CREATE TABLE plugin_configurations (
  id SERIAL PRIMARY KEY,
  plugin_id INTEGER NOT NULL REFERENCES plugin_registry(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plugin_id, config_key)
);

-- Create triggers
CREATE TRIGGER update_plugin_registry_updated_at
    BEFORE UPDATE ON plugin_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugin_configurations_updated_at
    BEFORE UPDATE ON plugin_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.10 Migration 010: Indexes

```sql
-- 010_add_indexes.sql

-- Customer indexes
CREATE INDEX idx_customers_nomor_hp ON customers(nomor_hp);
CREATE INDEX idx_customers_status ON customers(status_aktif);
CREATE INDEX idx_customers_created_at ON customers(created_at);

-- Voucher indexes
CREATE INDEX idx_vouchers_batch_id ON vouchers(batch_id);
CREATE INDEX idx_vouchers_code ON vouchers(voucher_code);
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_vouchers_expires_at ON vouchers(expires_at);
CREATE INDEX idx_vouchers_created_at ON vouchers(created_at);

-- PPPoE indexes
CREATE INDEX idx_pppoe_users_customer_id ON pppoe_users(customer_id);
CREATE INDEX idx_pppoe_users_username ON pppoe_users(username);
CREATE INDEX idx_pppoe_users_status ON pppoe_users(status);
CREATE INDEX idx_pppoe_users_expiry_date ON pppoe_users(expiry_date);

-- Payment indexes
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_invoice_number ON payments(invoice_number);
CREATE INDEX idx_payment_links_token ON payment_links(link_token);
CREATE INDEX idx_payment_links_expires_at ON payment_links(expires_at);

-- Subscription indexes
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_username ON subscriptions(username);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expiry_date ON subscriptions(expiry_date);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date);

-- WhatsApp indexes
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_to_number ON whatsapp_messages(to_number);
CREATE INDEX idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(status);

-- Log indexes
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_module ON system_logs(module);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);

-- Notification indexes
CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_priority ON notification_queue(priority DESC);
CREATE INDEX idx_notification_queue_scheduled_at ON notification_queue(scheduled_at);

-- Plugin indexes
CREATE INDEX idx_plugin_registry_type ON plugin_registry(plugin_type);
CREATE INDEX idx_plugin_registry_active ON plugin_registry(is_active);
```

## 3. Initial Data Insertion

### 3.1 Default Settings

```sql
-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
('company_name', 'Mikrotik Billing System', 'Company name for display'),
('company_address', 'Your Address Here', 'Company address'),
('company_phone', '+628123456789', 'Company phone number'),
('company_email', 'billing@example.com', 'Company email'),
('cleanup_interval', '3600000', 'Cleanup interval in milliseconds'),
('grace_period_hours', '0', 'Grace period in hours (0 = no grace period)'),
('invoice_expiry_days', '7', 'Invoice link expiry in days'),
('whatsapp_enabled', 'true', 'Enable WhatsApp notifications'),
('auto_sync_mikrotik', 'true', 'Auto sync with Mikrotik'),
('currency_code', 'IDR', 'Default currency code'),
('timezone', 'Asia/Jakarta', 'System timezone');
```

### 3.2 Default Admin User

```sql
-- Insert default admin (password: admin123)
INSERT INTO admin_users (username, password_hash, role, permissions) VALUES
('admin', '$2b$10$K8JpZ5K/pQZQI5JkL9L8I.7L9L8I.7L9L8I.7L9L8I.7L9L8I.7L9L8I.', 'super_admin', '{"all": true}');
```

### 3.3 Default Payment Methods

```sql
-- Insert manual payment method (always active)
INSERT INTO payment_plugins (name, display_name, version, description, is_system, is_active) VALUES
('manual', 'Manual/Cash', '1.0.0', 'Manual payment recording', true, true);

INSERT INTO payment_methods (plugin_id, method_code, method_name, method_type, fee_type) VALUES
((SELECT id FROM payment_plugins WHERE name = 'manual'), 'cash', 'Tunai', 'manual', 'fixed'),
((SELECT id FROM payment_plugins WHERE name = 'manual'), 'transfer', 'Transfer Bank', 'manual', 'fixed');
```

### 3.4 Default WhatsApp Templates

```sql
-- Insert default WhatsApp templates
INSERT INTO whatsapp_templates (name, category, template_content, variables) VALUES
('invoice_created', 'payment', '📄 *INVOICE BARU*\n\nHalo {customer_name},\n\nInvoice #{invoice_number}\nJumlah: Rp {amount}\nJatuh tempo: {due_date}\n\nBayar sekarang: {payment_url}\n\nTerima kasih!', '["customer_name", "invoice_number", "amount", "due_date", "payment_url"]'),
('payment_received', 'payment', '✅ *PEMBAYARAN DITERIMA*\n\nTerima kasih {customer_name}!\n\nInvoice #{invoice_number}\nJumlah: Rp {amount}\nMetode: {payment_method}\nTanggal: {paid_date}\n\nStatus: *LUNAS*', '["customer_name", "invoice_number", "amount", "payment_method", "paid_date"]'),
('subscription_reminder', 'reminder', '⏰ *PENGINGAT LANGGANAN*\n\nHalo {customer_name},\n\nPaket {package_name} Anda akan berakhir pada {expiry_date}.\n\nPerpanjang sekarang: {payment_url}\n\nTerima kasih!', '["customer_name", "package_name", "expiry_date", "payment_url"]'),
('voucher_created', 'notification', '🎫 *VOUCHER BARU*\n\nKode: {voucher_code}\nDurasi: {duration} jam\nHarga: Rp {price}\n\nTerima kasih!', '["voucher_code", "duration", "price"]');
```

## 4. Database Connection Configuration

### 4.1 Connection Pool Setup

```javascript
// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mikrotik_billing',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of connections
  min: 5,  // Minimum number of connections
  idle: 10000, // Idle timeout
  acquire: 30000, // Acquire timeout
  evict: 1000, // How often to check for idle connections
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = pool;
```

### 4.2 Query Helper

```javascript
// lib/query.js
class Query {
  constructor(pool) {
    this.pool = pool;
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Query error', { text, error });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Query;
```

## 5. Data Validation Constraints

### 5.1 Check Constraints

```sql
-- Additional constraints for data integrity

-- Validate phone number format
ALTER TABLE customers ADD CONSTRAINT chk_phone_format
  CHECK (nomor_hp ~ '^[\+]?[0-9]{10,15}$');

-- Validate amount is positive
ALTER TABLE payments ADD CONSTRAINT chk_amount_positive
  CHECK (amount > 0);

-- Validate dates
ALTER TABLE subscriptions ADD CONSTRAINT chk_dates
  CHECK (start_date <= expiry_date);

-- Validate voucher pricing
ALTER TABLE vouchers ADD CONSTRAINT chk_pricing
  CHECK (price_sell >= price_cost);

-- Validate invoice numbers
ALTER TABLE payments ADD CONSTRAINT chk_invoice_format
  CHECK (invoice_number ~ '^INV-[0-9]{4}-[0-9]{6}-[0-9]{4}$');
```

### 5.2 Triggers for Business Logic

```sql
-- Auto-generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' ||
      TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
      LPAD(EXTRACT(MONTH FROM CURRENT_DATE)::text, 2, '0') || '-' ||
      LPAD(nextval('invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE invoice_seq START 1;
CREATE TRIGGER generate_invoice_trigger
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- Update customer balance on payment
CREATE OR REPLACE FUNCTION update_customer_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    UPDATE customers
    SET credit_balance = credit_balance - NEW.amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_balance_trigger
  AFTER UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_customer_balance();
```

---

*Document Version: 2.0.0*
*Last Updated: 2025-01-09*