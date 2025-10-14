require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function finalDatabaseSetup() {
  console.log('🚀 Final Database Setup for Mikrotik Billing');
  console.log('===========================================');

  try {
    // Check existing tables
    console.log('\n1️⃣ Checking database state...');
    const existingTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'base_table'
    `);
    console.log(`   Existing tables: ${existingTables.rows.length}`);

    if (existingTables.rows.length > 0) {
      console.log('\n2️⃣ Dropping existing tables...');
      for (const table of existingTables.rows) {
        await pool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
        console.log(`   ✓ Dropped: ${table.table_name}`);
      }
    }

    // Read and process migration
    console.log('\n3️⃣ Creating database schema...');
    const migrationSQL = fs.readFileSync('./src/database/migrations/001_initial_schema.sql', 'utf8');

    // Execute statements one by one
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let tableCount = 0;
    for (const statement of statements) {
      try {
        // Handle CREATE TYPE
        if (statement.includes('CREATE TYPE user_status')) {
          await pool.query(statement);
          console.log('   ✓ Created: user_status ENUM');
          continue;
        }

        // Fix pppoe_users table
        if (statement.includes('CREATE TABLE IF NOT EXISTS pppoe_users')) {
          const fixedStatement = statement
            .replace('status user_status DEFAULT', 'status VARCHAR(20) DEFAULT')
            .replace('CHECK (status IN', "CHECK (status IN ('active', 'disabled', 'expired'");
          await pool.query(fixedStatement);
          tableCount++;
          console.log('   ✓ Created: pppoe_users');
          continue;
        }

        // Execute other statements
        if (statement.startsWith('CREATE') || statement.startsWith('ALTER')) {
          await pool.query(statement);

          // Extract table name for CREATE TABLE
          const tableName = statement.match(/CREATE TABLE.*?IF NOT EXISTS\s+(\w+)/);
          if (tableName) {
            tableCount++;
            console.log(`   ✓ Created: ${tableName[1]}`);
          }
        }
      } catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
          console.error(`   ✗ Error: ${e.message.substring(0, 100)}`);
        }
      }
    }

    console.log(`\n✅ Successfully created ${tableCount} tables!`);

    // Create admin user
    console.log('\n4️⃣ Setting up admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO admin_users (username, password_hash, name, role, permissions, is_active, created_at, updated_at)
      VALUES ('admin', $1, 'Administrator', 'super_admin', '["all"]', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);
    console.log('   ✓ Admin user: admin / admin123');

    // Insert settings
    console.log('\n5️⃣ Configuring default settings...');
    const settings = [
      ['company_name', 'HIJINETWORK WiFi'],
      ['company_address', 'Indonesia'],
      ['company_phone', '+628123456789'],
      ['mikrotik_host', '192.168.88.1'],
      ['mikrotik_port', '8728'],
      ['mikrotik_username', 'admin'],
      ['voucher_prefix', 'WH'],
      ['pppoe_prefix', 'PPP'],
      ['cleanup_interval', '3600000'],
      ['grace_period_hours', '24']
    ];

    for (const [key, value] of settings) {
      await pool.query(`
        INSERT INTO settings (key, value, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }
    console.log('   ✓ Default settings configured');

    // Create sample data
    console.log('\n6️⃣ Creating sample data...');

    // Sample profiles
    await pool.query(`
      INSERT INTO profiles (name, type, mikrotik_name, price_sell, price_cost, mikrotik_synced, managed_by)
      VALUES
        ('Hotspot 1 Hour', 'hotspot', 'hs-1h', 5000, 4500, false, 'system'),
        ('Hotspot 3 Hours', 'hotspot', 'hs-3h', 12000, 11000, false, 'system'),
        ('PPPoE Daily', 'pppoe', 'ppp-daily', 15000, 14000, false, 'system')
      ON CONFLICT (mikrotik_name, type) DO NOTHING
    `);
    console.log('   ✓ Sample profiles created');

    console.log('\n🎉 Database setup complete!');
    console.log('=====================================');

    // Final verification
    const finalTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'base_table'
      ORDER BY table_name
    `);

    console.log('\n📊 Final Summary:');
    console.log(`   • Total Tables: ${finalTables.rows.length}`);
    console.log('   • Admin Access: http://localhost:3123/login');
    console.log('   • Username: admin');
    console.log('   • Password: admin123');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    await pool.end();
    process.exit(1);
  }
}

finalDatabaseSetup();