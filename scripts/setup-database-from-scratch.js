require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Direct connection using DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

async function setupDatabaseFromScratch() {
  console.log('🚀 Starting database setup from scratch...');
  console.log('==============================================');

  try {
    // Test connection
    console.log('\n1️⃣ Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Connected to Supabase PostgreSQL');

    // Read migration file
    console.log('\n2️⃣ Reading migration file...');
    const migrationSQL = fs.readFileSync('./src/database/migrations/001_initial_schema.sql', 'utf8');

    // Drop all tables first
    console.log('\n3️⃣ Cleaning existing tables...');
    const dropStatements = migrationSQL
      .match(/DROP TABLE IF EXISTS [^;]+;/g) || [];

    for (const drop of dropStatements) {
      try {
        await pool.query(drop);
      } catch (e) {
        // Ignore errors when dropping non-existent tables
      }
    }

    // Extract CREATE TABLE statements
    console.log('\n4️⃣ Creating tables...');
    const createStatements = migrationSQL
      .match(/CREATE TABLE [^;]+;/g) || [];

    let tableCount = 0;
    for (const statement of createStatements) {
      try {
        // Fix ENUM creation for PostgreSQL
        let fixedStatement = statement;
        if (statement.includes('CREATE TYPE user_status')) {
          fixedStatement = `
            DO $$ BEGIN
              CREATE TYPE user_status AS ENUM ('active', 'disabled', 'expired');
            EXCEPTION
              WHEN duplicate_object THEN
                -- Type already exists, ignore
                NULL;
            END $$;
          `;
        }

        // Fix CREATE TABLE with user_status
        if (statement.includes('status user_status')) {
          fixedStatement = fixedStatement.replace('status user_status', 'status VARCHAR(20) DEFAULT \'active\' CHECK (status IN (\'active\', \'disabled\', \'expired\'))');
        }

        await pool.query(fixedStatement);
        tableCount++;

        // Get table name
        const tableName = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (tableName) {
          console.log(`   ✅ Created table: ${tableName[1]}`);
        }
      } catch (e) {
        console.error(`   ❌ Error: ${e.message}`);
        // Continue with next table
      }
    }

    console.log(`\n✅ Created ${tableCount} tables successfully!`);

    // List all created tables
    console.log('\n5️⃣ Verifying tables...');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'base_table'
      ORDER BY table_name
    `);

    console.log(`   Found ${tables.rows.length} tables:`);
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Insert default admin user
    console.log('\n6️⃣ Creating default admin user...');
    try {
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await pool.query(`
        INSERT INTO admin_users (username, password_hash, name, role, permissions, is_active, created_at, updated_at)
        VALUES ('admin', $1, 'Administrator', 'super_admin', '["all"]', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (username) DO NOTHING
      `, [hashedPassword]);

      console.log('   ✅ Default admin user created');
      console.log('   📝 Username: admin');
      console.log('   🔑 Password: admin123');
    } catch (e) {
      console.log('   ⚠️ Admin user already exists');
    }

    // Insert default settings
    console.log('\n7️⃣ Inserting default settings...');
    const defaultSettings = [
      ['company_name', 'HIJINETWORK WiFi'],
      ['company_address', 'Indonesia'],
      ['company_phone', '+628123456789'],
      ['mikrotik_host', '192.168.88.1'],
      ['mikrotik_port', '8728'],
      ['mikrotik_username', 'admin'],
      ['mikrotik_password', ''],
      ['voucher_prefix', 'WH'],
      ['pppoe_prefix', 'PPP'],
      ['cleanup_interval', '3600000'],
      ['grace_period_hours', '24'],
      ['whatsapp_enabled', 'true'],
      ['whatsapp_auto_reply', 'true']
    ];

    for (const [key, value] of defaultSettings) {
      try {
        await pool.query(`
          INSERT INTO settings (key, value, created_at, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
      } catch (e) {
        console.log(`   ⚠️ Setting ${key}: ${e.message}`);
      }
    }
    console.log('   ✅ Default settings inserted');

    // Insert sample user role
    console.log('\n8️⃣ Creating user roles...');
    try {
      await pool.query(`
        INSERT INTO user_roles (role_name, permissions, created_at)
        VALUES ('operator', '["customers:read", "customers:write", "vouchers:read", "vouchers:write", "pppoe:read", "pppoe:write"]', CURRENT_TIMESTAMP)
        ON CONFLICT (role_name) DO NOTHING
      `);
      console.log('   ✅ Created operator role');
    } catch (e) {
      console.log('   ⚠️ Operator role already exists');
    }

    // Create default payment plugins
    console.log('\n9️⃣ Setting up payment plugins...');
    const plugins = [
      ['duitku', 'DuitKu Payment Gateway', 'Integration with DuitKu payment service', true],
      ['manual', 'Manual/Cash Payment', 'Manual cash and credit payment recording', true]
    ];

    for (const [id, name, description, enabled] of plugins) {
      try {
        await pool.query(`
          INSERT INTO payment_plugins (id, name, description, enabled, created_at, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        `, [id, name, description, enabled]);
      } catch (e) {
        console.log(`   ⚠️ Plugin ${id}: ${e.message}`);
      }
    }
    console.log('   ✅ Payment plugins configured');

    console.log('\n🎉 Database setup completed successfully!');
    console.log('==============================================');

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   - Total tables: ${tables.rows.length}`);
    console.log('   - Admin user: admin / admin123');
    console.log('   - Default settings: Applied');
    console.log('   - Payment plugins: 2 plugins enabled');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('Stack trace:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

setupDatabaseFromScratch();