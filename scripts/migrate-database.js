const { db } = require('../src/database/DatabaseManager');
const fs = require('fs');
const bcrypt = require('bcrypt');

async function runMigration() {
  try {
    await db.initialize();
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
          await db.query(statement);
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
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'base_table'
      ORDER BY table_name
    `);

    console.log(`\n✅ Migration completed! Found ${tables.rows.length} tables:`);
    tables.rows.forEach(row => console.log('  -', row.table_name));

    // Insert default admin user
    try {
      const hashedPassword = await bcrypt.hash('admin123', 10);

      await db.query(`
        INSERT INTO admin_users (username, password_hash, name, role, permissions, is_active, created_at, updated_at)
        VALUES ('admin', $1, 'Administrator', 'super_admin', '["all"]', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (username) DO NOTHING
      `, [hashedPassword]);

      console.log('\n✅ Default admin user created (username: admin, password: admin123)');
    } catch (e) {
      console.log('\n⚠️ Admin user already exists or error:', e.message);
    }

    console.log('\n🎉 Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();