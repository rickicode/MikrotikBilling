require('dotenv').config();
const { Pool } = require('pg');

// Direct connection using DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5 // Limit connections
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to Supabase database');

    // Execute tables one by one with better error handling
    const tables = [
      'admin_users',
      'customers',
      'vouchers',
      'pppoe_users',
      'profiles',
      'payments',
      'subscriptions',
      'vendors',
      'settings',
      'whatsapp_sessions',
      'whatsapp_messages',
      'whatsapp_templates',
      'notification_queue',
      'activity_logs',
      'transaction_logs',
      'payment_links',
      'payment_transactions',
      'duitku_configurations',
      'user_roles',
      'payment_plugins',
      'plugin_configurations',
      'plugin_error_logs'
    ];

    console.log(`\n📝 Creating ${tables.length} tables...`);

    for (const table of tables) {
      try {
        // Read specific table creation from migration file
        const fs = require('fs');
        const migrationSQL = fs.readFileSync('./src/database/migrations/001_initial_schema.sql', 'utf8');

        // Extract CREATE TABLE statement for this table
        const createRegex = new RegExp(`CREATE TABLE ${table} [^;]+;`, 'is');
        const match = migrationSQL.match(createRegex);

        if (match) {
          await client.query(match[0]);
          console.log(`✅ Created table: ${table}`);
        } else {
          console.log(`⚠️ Table definition not found: ${table}`);
        }
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`✅ Table already exists: ${table}`);
        } else {
          console.error(`❌ Error creating ${table}:`, e.message);
        }
      }
    }

    // Insert default admin
    try {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await client.query(`
        INSERT INTO admin_users (username, password_hash, name, role, permissions, is_active, created_at, updated_at)
        VALUES ('admin', $1, 'Administrator', 'super_admin', '["all"]', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (username) DO NOTHING
      `, [hashedPassword]);

      console.log('\n✅ Default admin user created (username: admin, password: admin123)');
    } catch (e) {
      console.log('\n⚠️ Admin user already exists');
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();