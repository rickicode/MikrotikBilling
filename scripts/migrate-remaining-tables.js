require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createRemainingTables() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to Supabase database');

    // Create remaining tables with corrected syntax
    const remainingTables = [
      {
        name: 'vouchers',
        sql: `
          CREATE TABLE IF NOT EXISTS vouchers (
              id SERIAL PRIMARY KEY,
              batch_id VARCHAR(50) NOT NULL DEFAULT '',
              code VARCHAR(20) UNIQUE NOT NULL,
              price_sell DECIMAL(10,2) NOT NULL,
              price_cost DECIMAL(10,2) NOT NULL,
              status VARCHAR(20) DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired', 'disabled')),
              duration_hours INTEGER NOT NULL,
              mikrotik_synced BOOLEAN DEFAULT false,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'pppoe_users',
        sql: `
          CREATE TYPE IF NOT EXISTS user_status AS ENUM ('active', 'disabled', 'expired');

          CREATE TABLE IF NOT EXISTS pppoe_users (
              id SERIAL PRIMARY KEY,
              username VARCHAR(50) UNIQUE NOT NULL,
              password VARCHAR(50) NOT NULL,
              customer_id INTEGER REFERENCES customers(id),
              profile_id INTEGER REFERENCES profiles(id),
              name VARCHAR(100),
              status user_status DEFAULT 'active',
              expires_at TIMESTAMP,
              mikrotik_synced BOOLEAN DEFAULT false,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'payments',
        sql: `
          CREATE TABLE IF NOT EXISTS payments (
              id SERIAL PRIMARY KEY,
              customer_id INTEGER REFERENCES customers(id),
              amount DECIMAL(10,2) NOT NULL,
              method VARCHAR(50) NOT NULL,
              status VARCHAR(20) NOT NULL,
              invoice_number VARCHAR(50),
              payment_link_id INTEGER REFERENCES payment_links(id),
              duitku_invoice_number VARCHAR(50),
              duitku_payment_method VARCHAR(50),
              duitku_callback_data TEXT,
              notes TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `
      },
      {
        name: 'carry_over_balances',
        sql: `
          CREATE TABLE IF NOT EXISTS carry_over_balances (
              id SERIAL PRIMARY KEY,
              customer_id INTEGER NOT NULL REFERENCES customers(id),
              subscription_id INTEGER REFERENCES subscriptions(id),
              amount DECIMAL(10,2) NOT NULL,
              currency VARCHAR(3) DEFAULT 'IDR',
              original_payment_id VARCHAR(50),
              is_used BOOLEAN DEFAULT false,
              used_amount DECIMAL(10,2) DEFAULT 0,
              expires_at TIMESTAMP NOT NULL,
              used_at TIMESTAMP,
              notes TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `
      }
    ];

    console.log('\n📝 Creating remaining tables...');

    for (const table of remainingTables) {
      try {
        await client.query(table.sql);
        console.log(`✅ Created table: ${table.name}`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`✅ Table already exists: ${table.name}`);
        } else {
          console.error(`❌ Error creating ${table.name}:`, e.message);
        }
      }
    }

    console.log('\n🎉 All tables created successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createRemainingTables();