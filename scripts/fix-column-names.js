const { db } = require('../src/database/DatabaseManager');

async function fixColumnNames() {
  try {
    await db.initialize();
    console.log('🔧 Fixing column names for PostgreSQL compatibility...');

    // Check current columns in customers table
    const customersColumns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'customers'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Current customers table columns:');
    customersColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Check if we need to add missing columns
    const hasNameColumn = customersColumns.rows.some(col => col.column_name === 'name');
    const hasPhoneColumn = customersColumns.rows.some(col => col.column_name === 'phone');
    const hasNamaColumn = customersColumns.rows.some(col => col.column_name === 'nama');
    const hasNomorHpColumn = customersColumns.rows.some(col => col.column_name === 'nomor_hp');

    // Add name column if it doesn't exist
    if (!hasNameColumn && hasNamaColumn) {
      console.log('\n🔄 Adding "name" column...');
      await db.query('ALTER TABLE customers ADD COLUMN name VARCHAR(100)');
      await db.query('UPDATE customers SET name = nama');
      console.log('✅ Copied data from "nama" to "name"');
    }

    // Add phone column if it doesn't exist
    if (!hasPhoneColumn && hasNomorHpColumn) {
      console.log('\n🔄 Adding "phone" column...');
      await db.query('ALTER TABLE customers ADD COLUMN phone VARCHAR(20)');
      await db.query('UPDATE customers SET phone = nomor_hp');
      console.log('✅ Copied data from "nomor_hp" to "phone"');
    }

    // Check profiles table
    const profilesColumns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Current profiles table columns:');
    profilesColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Check pppoe_users table
    const pppoeColumns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'pppoe_users'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Current pppoe_users table columns:');
    pppoeColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Add missing columns to pppoe_users if needed
    const hasPriceSell = pppoeColumns.rows.some(col => col.column_name === 'price_sell');
    const hasPriceCost = pppoeColumns.rows.some(col => col.column_name === 'price_cost');
    const hasStartDate = pppoeColumns.rows.some(col => col.column_name === 'start_date');
    const hasExpiryDate = pppoeColumns.rows.some(col => col.column_name === 'expiry_date');
    const hasMikrotikUser = pppoeColumns.rows.some(col => col.column_name === 'mikrotik_user');

    if (!hasPriceSell) {
      console.log('\n🔄 Adding "price_sell" column to pppoe_users...');
      await db.query('ALTER TABLE pppoe_users ADD COLUMN price_sell DECIMAL(10,2) DEFAULT 0.00');
    }

    if (!hasPriceCost) {
      console.log('\n🔄 Adding "price_cost" column to pppoe_users...');
      await db.query('ALTER TABLE pppoe_users ADD COLUMN price_cost DECIMAL(10,2) DEFAULT 0.00');
    }

    if (!hasStartDate) {
      console.log('\n🔄 Adding "start_date" column to pppoe_users...');
      await db.query('ALTER TABLE pppoe_users ADD COLUMN start_date DATE DEFAULT CURRENT_DATE');
    }

    if (!hasExpiryDate) {
      console.log('\n🔄 Adding "expiry_date" column to pppoe_users...');
      await db.query('ALTER TABLE pppoe_users ADD COLUMN expiry_date DATE');
    }

    if (!hasMikrotikUser) {
      console.log('\n🔄 Adding "mikrotik_user" column to pppoe_users...');
      await db.query('ALTER TABLE pppoe_users ADD COLUMN mikrotik_user VARCHAR(100)');
    }

    // Check vouchers table for vendor_id
    const vouchersColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'vouchers'
      ORDER BY ordinal_position
    `);

    const hasVendorId = vouchersColumns.rows.some(col => col.column_name === 'vendor_id');
    if (!hasVendorId) {
      console.log('\n🔄 Adding "vendor_id" column to vouchers...');
      await db.query('ALTER TABLE vouchers ADD COLUMN vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL');
    }

    console.log('\n✅ Column fixes completed successfully!');
    await db.close();
  } catch (error) {
    console.error('❌ Error fixing columns:', error);
    process.exit(1);
  }
}

fixColumnNames();