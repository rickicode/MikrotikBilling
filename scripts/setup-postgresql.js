#!/usr/bin/env node

require('dotenv').config();
const { db } = require('../src/database/DatabaseManager');
const bcrypt = require('bcrypt');

/**
 * PostgreSQL Setup Script for Mikrotik Billing System
 * Creates tables and seeds initial data
 */

console.log('🚀 Setting up PostgreSQL Database for Mikrotik Billing System...');
console.log('============================================================\n');

async function setupPostgreSQL() {
  try {
    // Initialize database
    console.log('1️⃣ Connecting to PostgreSQL...');
    await db.initialize();
    console.log('✅ Connected successfully!\n');

    // Check if tables exist
    console.log('2️⃣ Checking existing tables...');
    const existingTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const tableNames = existingTables.rows.map(r => r.table_name);
    console.log(`   Found ${tableNames.length} tables: ${tableNames.join(', ')}\n`);

    // Create tables if they don't exist
    console.log('3️⃣ Creating tables...');

    // Create admin_users table
    if (!tableNames.includes('admin_users')) {
      await db.query(`
        CREATE TABLE admin_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'operator')),
          permissions JSONB DEFAULT '{}',
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created admin_users table');
    }

    // Create customers table
    if (!tableNames.includes('customers')) {
      await db.query(`
        CREATE TABLE customers (
          id SERIAL PRIMARY KEY,
          nama VARCHAR(255) NOT NULL,
          phone VARCHAR(20) UNIQUE NOT NULL,
          email VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          credit_balance DECIMAL(10,2) DEFAULT 0,
          debt_balance DECIMAL(10,2) DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created customers table');
    }

    // Create settings table
    if (!tableNames.includes('settings')) {
      await db.query(`
        CREATE TABLE settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created settings table');
    }

    // Create profiles table
    if (!tableNames.includes('profiles')) {
      await db.query(`
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
        )
      `);
      console.log('   ✓ Created profiles table');
    }

    // Create vouchers table
    if (!tableNames.includes('vouchers')) {
      await db.query(`
        CREATE TABLE vouchers (
          id SERIAL PRIMARY KEY,
          code VARCHAR(20) UNIQUE NOT NULL,
          profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
          price_sell DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'unused' CHECK(status IN ('unused', 'used', 'expired', 'disabled')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          used_at TIMESTAMP,
          
        )
      `);
      console.log('   ✓ Created vouchers table');
    }

    // Create pppoe_users table
    if (!tableNames.includes('pppoe_users')) {
      await db.query(`
        CREATE TABLE pppoe_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
          customer_id INTEGER REFERENCES customers(id),
          status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'expired')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP,
          last_login TIMESTAMP,
          mikrotik_name VARCHAR(100)
        )
      `);
      console.log('   ✓ Created pppoe_users table');
    }

    // Create subscriptions table
    if (!tableNames.includes('subscriptions')) {
      await db.query(`
        CREATE TABLE subscriptions (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL REFERENCES customers(id),
          service_type VARCHAR(20) NOT NULL CHECK(service_type IN ('hotspot', 'pppoe')),
          profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
          username VARCHAR(100),
          billing_cycle VARCHAR(20) DEFAULT 'onetime' CHECK(billing_cycle IN ('daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'onetime')),
          price_sell DECIMAL(10,2) NOT NULL,
          price_cost DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled')),
          auto_renew BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expiry_date DATE,
          next_billing_date DATE
        )
      `);
      console.log('   ✓ Created subscriptions table');
    }

    // Create payments table
    if (!tableNames.includes('payments')) {
      await db.query(`
        CREATE TABLE payments (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id),
          subscription_id INTEGER REFERENCES subscriptions(id),
          amount DECIMAL(10,2) NOT NULL,
          method VARCHAR(50) DEFAULT 'cash',
          status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed', 'cancelled')),
          transaction_id VARCHAR(100),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created payments table');
    }

    // Create system_logs table
    if (!tableNames.includes('system_logs')) {
      await db.query(`
        CREATE TABLE system_logs (
          id SERIAL PRIMARY KEY,
          level VARCHAR(20) CHECK(level IN ('ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'CRITICAL', 'ALERT')) NOT NULL,
          module VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          details JSONB,
          user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
          ip_address INET,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created system_logs table');
    }

    // Create user_sessions table
    if (!tableNames.includes('user_sessions')) {
      await db.query(`
        CREATE TABLE user_sessions (
          session_id VARCHAR(100) PRIMARY KEY,
          user_id INTEGER NOT NULL,
          user_type VARCHAR(20) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created user_sessions table');
    }

    // Create user_activity_logs table
    if (!tableNames.includes('user_activity_logs')) {
      await db.query(`
        CREATE TABLE user_activity_logs (
          id SERIAL PRIMARY KEY,
          user_type VARCHAR(20) NOT NULL,
          user_id INTEGER NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(50),
          target_id INTEGER,
          details TEXT,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created user_activity_logs table');
    }

    // Create admin_activity_logs table
    if (!tableNames.includes('admin_activity_logs')) {
      await db.query(`
        CREATE TABLE admin_activity_logs (
          id SERIAL PRIMARY KEY,
          admin_id INTEGER NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(50),
          target_id INTEGER,
          details TEXT,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created admin_activity_logs table');
    }

    // Create hotspot_users table
    if (!tableNames.includes('hotspot_users')) {
      await db.query(`
        CREATE TABLE hotspot_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          profile_id INTEGER REFERENCES profiles(id),
          customer_id INTEGER REFERENCES customers(id),
          comment TEXT,
          mikrotik_synced BOOLEAN DEFAULT false,
          first_login TIMESTAMP,
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created hotspot_users table');
    }

    // Create notification_queue table
    if (!tableNames.includes('notification_queue')) {
      await db.query(`
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
        )
      `);
      console.log('   ✓ Created notification_queue table');
    }

    // Create whatsapp_sessions table
    if (!tableNames.includes('whatsapp_sessions')) {
      await db.query(`
        CREATE TABLE whatsapp_sessions (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(100) UNIQUE NOT NULL,
          session_name VARCHAR(100) NOT NULL,
          phone_number VARCHAR(20),
          status VARCHAR(20) DEFAULT 'disconnected',
          priority INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          is_default BOOLEAN DEFAULT false,
          qr_code TEXT,
          last_activity TIMESTAMP,
          webhook_url VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created whatsapp_sessions table');
    }

    // Create whatsapp_templates table
    if (!tableNames.includes('whatsapp_templates')) {
      await db.query(`
        CREATE TABLE whatsapp_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          category VARCHAR(50) NOT NULL,
          language VARCHAR(10) DEFAULT 'id',
          content TEXT NOT NULL,
          variables JSONB,
          is_active BOOLEAN DEFAULT true,
          is_approved BOOLEAN DEFAULT false,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('   ✓ Created whatsapp_templates table');
    }

    // Create indexes for better performance
    console.log('\n4️⃣ Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
      'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)',
      'CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status)',
      'CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code)',
      'CREATE INDEX IF NOT EXISTS idx_pppoe_users_username ON pppoe_users(username)',
      'CREATE INDEX IF NOT EXISTS idx_pppoe_users_customer ON pppoe_users(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)',
      'CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)',
      'CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)',
      'CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id, user_type)',
      'CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id)',
      'CREATE INDEX IF NOT EXISTS idx_hotspot_users_username ON hotspot_users(username)',
      'CREATE INDEX IF NOT EXISTS idx_hotspot_users_customer ON hotspot_users(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status)',
      'CREATE INDEX IF NOT EXISTS idx_notification_queue_send_after ON notification_queue(send_after)',
      'CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category ON whatsapp_templates(category)'
    ];

    for (const indexSql of indexes) {
      await db.query(indexSql);
    }
    console.log('   ✓ Created all indexes');

    // Seed default data
    console.log('\n5️⃣ Seeding default data...');

    // Check if admin user exists
    const adminResult = await db.query('SELECT * FROM admin_users WHERE username = $1', ['admin']);
  const adminCount = adminResult.rows && adminResult.rows.length > 0 ? adminResult.rows[0] : null;

    if (!adminCount) {
      // Create default admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.query(
        'INSERT INTO admin_users (username, password_hash, role, permissions) VALUES ($1, $2, $3, $4)',
        ['admin', hashedPassword, 'super_admin', JSON.stringify({
          customers: ['create', 'read', 'update', 'delete'],
          vouchers: ['create', 'read', 'update', 'delete'],
          pppoe: ['create', 'read', 'update', 'delete'],
          profiles: ['create', 'read', 'update', 'delete'],
          payments: ['create', 'read', 'update', 'delete'],
          settings: ['create', 'read', 'update'],
          reports: ['read'],
          admin: ['read', 'update']
        })]
      );
      console.log('   ✓ Created default admin user (admin/admin123)');
    } else {
      console.log('   ✓ Admin user already exists');
    }

    // Insert default settings
    const defaultSettings = [
      {
        key: 'company_name',
        value: 'Mikrotik Billing System',
        description: 'Company or WiFi name'
      },
      {
        key: 'currency',
        value: 'IDR',
        description: 'Currency code'
      },
      {
        key: 'timezone',
        value: 'Asia/Jakarta',
        description: 'System timezone'
      },
      {
        key: 'voucher_prefix',
        value: 'HS',
        description: 'Default voucher prefix'
      },
      {
        key: 'pppoe_prefix',
        value: 'PP',
        description: 'Default PPPoE username prefix'
      },
      {
        key: 'cleanup_expired_days',
        value: '30',
        description: 'Days before cleaning expired users'
      },
      {
        key: 'mikrotik_host',
        value: '192.168.88.1',
        description: 'Mikrotik Router IP address'
      },
      {
        key: 'mikrotik_username',
        value: 'admin',
        description: 'Mikrotik API username'
      },
      {
        key: 'mikrotik_password',
        value: '',
        description: 'Mikrotik API password'
      },
      {
        key: 'mikrotik_port',
        value: '8728',
        description: 'Mikrotik API port'
      }
    ];

    for (const setting of defaultSettings) {
      const existsResult = await db.query('SELECT * FROM settings WHERE key = $1', [setting.key]);
  const exists = existsResult.rows && existsResult.rows.length > 0;
      if (!exists) {
        await db.query('INSERT INTO settings (key, value, description) VALUES ($1, $2, $3)', [setting.key, setting.value, setting.description]);
      }
    }
    console.log('   ✓ Inserted default settings');

    // Create sample profiles if none exist
    const profileResult = await db.query('SELECT COUNT(*) as count FROM profiles');
  const profileCount = profileResult.rows && profileResult.rows.length > 0 ? parseInt(profileResult.rows[0].count) : 0;
    if (profileCount === 0) {
      const sampleProfiles = [
        {
          name: '1-Hour',
          type: 'hotspot',
          price_cost: 5000,
          price_sell: 10000,
          duration: 60,
          duration_unit: 'minutes',
          bandwidth_up: '2M',
          bandwidth_down: '5M',
          comment_marker: 'HOTSPOT_SYSTEM'
        },
        {
          name: '1-Day',
          type: 'hotspot',
          price_cost: 10000,
          price_sell: 20000,
          duration: 24,
          duration_unit: 'hours',
          bandwidth_up: '2M',
          bandwidth_down: '5M',
          comment_marker: 'HOTSPOT_SYSTEM'
        },
        {
          name: '1-Week',
          type: 'pppoe',
          price_cost: 25000,
          price_sell: 50000,
          duration: 7,
          duration_unit: 'days',
          bandwidth_up: '3M',
          bandwidth_down: '10M',
          comment_marker: 'PPPOE_SYSTEM'
        },
        {
          name: '1-Month',
          type: 'pppoe',
          price_cost: 80000,
          price_sell: 150000,
          duration: 30,
          duration_unit: 'days',
          bandwidth_up: '5M',
          bandwidth_down: '20M',
          comment_marker: 'PPPOE_SYSTEM'
        }
      ];

      for (const profile of sampleProfiles) {
        await db.query(
    'INSERT INTO profiles (name, profile_type, cost_price, selling_price, duration_hours, mikrotik_name) VALUES ($1, $2, $3, $4, $5, $6)',
    [profile.name, profile.type, profile.price_cost, profile.price_sell, profile.duration, profile.name]
  );
      }
      console.log('   ✓ Created sample profiles');
    }

    console.log('\n✨ PostgreSQL setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Created/verified all required tables`);
    console.log('   - Created default admin user (username: admin, password: admin123)');
    console.log('   - Inserted default settings');
    console.log('   - Created sample profiles');
    console.log('   - Created performance indexes');

    console.log('\n🚀 You can now start the application:');
    console.log('   npm run dev      (for development)');
    console.log('   npm start        (for production)');

    console.log('\n🌐 Access the application at: http://localhost:3000');
    console.log('   Login with: admin / admin123');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure PostgreSQL is running');
    console.error('2. Check your .env file database settings');
    console.error('3. Create database: createdb mikrotik_billing');
    process.exit(1);
  } finally {
    await db.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run setup
if (require.main === module) {
  setupPostgreSQL().catch(console.error);
}

module.exports = setupPostgreSQL;