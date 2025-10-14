#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');
const { db } = require('../src/database/DatabaseManager');

/**
 * PostgreSQL Database Test Script
 * Tests database connection and basic operations for Mikrotik Billing System
 */

console.log('🔍 Testing PostgreSQL Database Connection...');
console.log('==========================================\n');

async function testDatabase() {
  try {
    // Initialize database through DatabaseManager
    await db.initialize();
    console.log('✅ Database connection successful');

    // Test basic query
    const result = await db.query('SELECT version() as version, NOW() as current_time');
    console.log('✅ Basic query successful!');
    console.log('   PostgreSQL version:', result.rows[0].version.split(' ').slice(0, 2).join(' '));
    console.log('   Current time:', result.rows[0].current_time.toISOString());
    console.log();

    // Test table operations
    console.log('📊 Testing table operations...');

    // Test customers table
    const customerCount = await db.count('customers');
    console.log(`✅ Customers table accessible (${customerCount} records)`);

    // Test settings table
    const settingsCount = await db.count('settings');
    console.log(`✅ Settings table accessible (${settingsCount} records)`);

    // Test profiles table
    const profilesCount = await db.count('profiles');
    console.log(`✅ Profiles table accessible (${profilesCount} records)`);

    // Test insert operation
    console.log('\n➕ Testing CRUD operations...');
    const testCustomer = {
      nama: 'Test PostgreSQL Connection',
      nomor_hp: '+628999999999',
      email: 'test.pg@database.com',
      status_aktif: true,
      credit_balance: 100000,
      debt_balance: 0
    };

    const inserted = await db.insert('customers', testCustomer);
    console.log('✅ Insert operation successful - ID:', inserted.id);

    // Test select operation
    const selected = await db.getOne('customers', { id: inserted.id });
    console.log('✅ Select operation successful - Name:', selected.nama);

    // Test update operation
    const updated = await db.update(
      'customers',
      {
        email: 'updated.pg@database.com',
        credit_balance: 150000
      },
      { id: inserted.id }
    );
    console.log('✅ Update operation successful - Email:', updated.email);

    // Test delete operation
    await db.delete('customers', { id: inserted.id });
    console.log('✅ Delete operation successful');

    // Test transaction
    console.log('\n💾 Testing transactions...');
    await db.transaction(async (trx) => {
      const trxCustomer = await trx('customers').insert({
        nama: 'Transaction Test',
        nomor_hp: '+628888888888',
        email: 'transaction@test.com',
        status_aktif: true,
        credit_balance: 50000
      }).returning('*');

      await trx('customers').where('id', trxCustomer[0].id).del();
    });
    console.log('✅ Transaction successful');

    // Test complex query
    console.log('\n🔍 Testing complex queries...');
    const complexQuery = await db.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN status_aktif = true THEN 1 END) as active_customers,
        COALESCE(SUM(credit_balance), 0) as total_credit,
        COALESCE(SUM(debt_balance), 0) as total_debt
      FROM customers
    `);
    console.log('✅ Complex query successful:', {
      total: complexQuery.rows[0].total_customers,
      active: complexQuery.rows[0].active_customers,
      total_credit: parseFloat(complexQuery.rows[0].total_credit),
      total_debt: parseFloat(complexQuery.rows[0].total_debt)
    });

    // Test JSONB operations
    console.log('\n📄 Testing JSONB operations...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS test_jsonb (
        id SERIAL PRIMARY KEY,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const jsonInsert = await db.insert('test_jsonb', {
      data: {
        test: 'PostgreSQL JSONB',
        nested: {
          value: 123,
          array: [1, 2, 3],
          boolean: true
        }
      }
    });

    const jsonSelect = await db.getOne('test_jsonb', { id: jsonInsert.id });
    console.log('✅ JSONB operations successful - Data:', JSON.stringify(jsonSelect.data));

    // Test JSONB query
    const jsonQuery = await db.query(`
      SELECT data->>'test' as test_value,
             data->'nested'->>'value' as nested_value
      FROM test_jsonb
      WHERE id = $1
    `, [jsonInsert.id]);
    console.log('✅ JSONB query successful:', jsonQuery.rows[0]);

    // Cleanup
    await db.query('DROP TABLE IF EXISTS test_jsonb');

    // Test PostgreSQL-specific features
    console.log('\n🎯 Testing PostgreSQL-specific features...');

    // Test array operations
    await db.query(`
      CREATE TABLE IF NOT EXISTS test_array (
        id SERIAL PRIMARY KEY,
        tags TEXT[],
        numbers INTEGER[]
      )
    `);

    const arrayInsert = await db.insert('test_array', {
      tags: ['tag1', 'tag2', 'tag3'],
      numbers: [1, 2, 3, 4, 5]
    });

    const arraySelect = await db.getOne('test_array', { id: arrayInsert.id });
    console.log('✅ Array operations successful - Tags:', arraySelect.tags);

    await db.query('DROP TABLE IF EXISTS test_array');

    // Test window functions
    const windowQuery = await db.query(`
      SELECT
        nama,
        created_at,
        ROW_NUMBER() OVER (ORDER BY created_at DESC) as row_num
      FROM customers
      LIMIT 5
    `);
    console.log('✅ Window function successful - Rows returned:', windowQuery.rowCount);

    // Test CTE (Common Table Expression)
    const cteQuery = await db.query(`
      WITH customer_stats AS (
        SELECT
          COUNT(*) as total,
          AVG(credit_balance) as avg_balance
        FROM customers
        WHERE status_aktif = true
      )
      SELECT * FROM customer_stats
    `);
    console.log('✅ CTE query successful - Stats:', cteQuery.rows[0]);

    console.log('\n✨ All database tests passed successfully!');
    console.log('✅ PostgreSQL is working correctly with the application');

    // Performance test
    console.log('\n⚡ Running performance test...');
    const start = Date.now();
    await db.query('SELECT COUNT(*) FROM customers');
    const queryTime = Date.now() - start;
    console.log(`✅ Query performance: ${queryTime}ms`);

    if (queryTime > 100) {
      console.warn('⚠️  Warning: Query performance is slow. Consider adding indexes.');
    }

  } catch (error) {
    console.error('\n❌ Database test failed:', error.message);
    console.error('Stack:', error.stack);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL is not running.');
      console.error('   Start it with: brew services start postgresql (macOS)');
      console.error('               sudo systemctl start postgresql (Linux)');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Check DB_USER and DB_PASSWORD.');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist. Create it with:');
      console.error('   createdb', process.env.DB_NAME || 'mikrotik_billing');
    }

    process.exit(1);
  } finally {
    // Close database connection
    await db.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Check if PostgreSQL is installed and running
async function checkPostgresStatus() {
  try {
    const { execSync } = require('child_process');
    execSync('pg_isready', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const isRunning = await checkPostgresStatus();

  if (!isRunning) {
    console.error('❌ PostgreSQL is not running!');
    console.error('\nPlease start PostgreSQL first:');
    console.error('  - macOS: brew services start postgresql');
    console.error('  - Ubuntu: sudo systemctl start postgresql');
    console.error('  - Windows: Start PostgreSQL service from Services');
    process.exit(1);
  }

  await testDatabase();
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testDatabase };