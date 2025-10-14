const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')
    ? { rejectUnauthorized: false }
    : false
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running migration 006_fix_missing_tables.sql...');

    // Read the migration file
    const fs = require('fs');
    const path = require('path');
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../src/database/migrations/006_fix_missing_tables.sql'),
      'utf8'
    );

    // Execute migration
    await client.query(migrationSQL);

    // Record migration in knex_migrations table
    const migrationName = '006_fix_missing_tables.sql';
    const migrationTimestamp = Date.now();

    // Check if knex_migrations table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'knex_migrations'
      );
    `);

    if (tableExists.rows[0].exists) {
      // Check if migration already exists
      const migrationExists = await client.query(`
        SELECT 1 FROM knex_migrations
        WHERE name = $1
      `, [migrationName]);

      if (!migrationExists.rows[0]) {
        // Insert migration record
        await client.query(`
          INSERT INTO knex_migrations (name, batch, migration_time)
          VALUES ($1, 1, to_timestamp($2 / 1000.0))
        `, [migrationName, migrationTimestamp]);
      }
    }

    console.log('✅ Migration 006 completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);