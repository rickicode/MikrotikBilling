#!/usr/bin/env node

require('dotenv').config();
const { db } = require('../src/database/DatabaseManager');

async function setupDatabase() {
  try {
    console.log('🚀 Initializing Database Manager...');
    await db.initialize();

    console.log('✅ Database Manager initialized successfully!');
    console.log('\nDatabase connection established with Knex.js');

    // Test a simple query
    const result = await db.query('SELECT version() as version');
    console.log(`PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);

    // List tables
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nTables found:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();