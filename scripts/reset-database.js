const { Pool } = require('pg');
require('dotenv').config();

/**
 * Database Reset Script for Testing
 * Resets PostgreSQL database to clean state for testing
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/mikrotik_billing'
});

async function resetDatabase() {
  console.log('🔄 Starting database reset...');
  
  try {
    await pool.connect();
    console.log('✅ Connected to database');

    // Get all table names
    const tablesQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows.map(row => row.tablename);
    
    console.log('📊 Found tables:', tables);

    // Disable foreign key constraints temporarily
    await pool.query('SET session_replication_role = replica;');

    // Truncate all tables in correct order
    const tableOrder = [
      'whatsapp_messages',
      'whatsapp_sessions', 
      'payment_plugin_transactions',
      'payments',
      'subscriptions',
      'vouchers',
      'customers',
      'profiles',
      'admin_users',
      'settings',
      'payment_methods',
      'payment_plugins'
    ];

    for (const tableName of tableOrder) {
      if (tables.includes(tableName)) {
        try {
          await pool.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE;`);
          console.log(`✅ Truncated table: ${tableName}`);
        } catch (error) {
          console.warn(`⚠️ Could not truncate ${tableName}:`, error.message);
        }
      }
    }

    // Re-enable foreign key constraints
    await pool.query('SET session_replication_role = DEFAULT;');

    // Insert default admin user
    const adminQuery = `
      INSERT INTO admin_users (username, password, role, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (username) DO NOTHING
    `;
    
    await pool.query(adminQuery, ['admin', '$2b$10$rQZ8kHWKtGY.iu.3s.4u9.LgB3RZjZjGZGZGZGZGZGZGZGZGZGZG', 'super_admin']);
    console.log('✅ Default admin user inserted');

    // Insert default settings
    const settingsQuery = `
      INSERT INTO settings (key, value, created_at, updated_at)
      VALUES 
        ('company_name', 'HIJINETWORK', NOW(), NOW()),
        ('wifi_name', 'HIJINETWORK Hotspot', NOW(), NOW()),
        ('mikrotik_host', '54.37.252.142', NOW(), NOW()),
        ('mikrotik_user', 'admin', NOW(), NOW()),
        ('mikrotik_password', 'ganteng', NOW(), NOW()),
        ('currency', 'IDR', NOW(), NOW()),
        ('timezone', 'Asia/Jakarta', NOW(), NOW())
      ON CONFLICT (key) DO NOTHING
    `;
    
    await pool.query(settingsQuery);
    console.log('✅ Default settings inserted');

    console.log('🎉 Database reset completed successfully!');
    
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  resetDatabase()
    .then(() => {
      console.log('✅ Database reset completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database reset failed:', error);
      process.exit(1);
    });
}

module.exports = { resetDatabase };
