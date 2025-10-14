require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Direct connection using DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('✅ Connecting to database...');

    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    // Read migration file
    const migrationSQL = fs.readFileSync('./src/database/migrations/001_initial_schema.sql', 'utf8');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    let successCount = 0;
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        try {
          await pool.query(statement);
          successCount++;
          if ((i + 1) % 10 === 0 || i === statements.length - 1) {
            console.log(`✅ ${successCount}/${statements.length} statements executed`);
          }
        } catch (e) {
          if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
            console.error(`❌ Error in statement ${i + 1}:`, e.message);
            console.error(`Statement: ${statement.substring(0, 100)}...`);
          }
        }
      }
    }

    // Check tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'base_table'
      ORDER BY table_name
    `);

    console.log(`\n✅ Migration completed! Found ${tables.rows.length} tables:`);
    tables.rows.forEach(row => console.log('  -', row.table_name));

    // Insert default admin user
    try {
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await pool.query(`
        INSERT INTO admin_users (username, password_hash, name, role, permissions, is_active, created_at, updated_at)
        VALUES ('admin', $1, 'Administrator', 'super_admin', '["all"]', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (username) DO NOTHING
      `, [hashedPassword]);

      console.log('\n✅ Default admin user created (username: admin, password: admin123)');
    } catch (e) {
      console.log('\n⚠️ Admin user already exists or error:', e.message);
    }

    // Insert default settings
    try {
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
        ['grace_period_hours', '24']
      ];

      for (const [key, value] of defaultSettings) {
        await pool.query(`
          INSERT INTO settings (key, value, created_at, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
      }

      console.log('✅ Default settings inserted');
    } catch (e) {
      console.log('⚠️ Settings already exist or error:', e.message);
    }

    console.log('\n🎉 Database setup complete!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();