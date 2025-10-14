/**
 * Initial Schema Migration for PostgreSQL
 * Run with: npm run migrate
 */

exports.up = function(knex) {
  return knex.schema
    // Admin users table
    .createTable('admin_users', function(table) {
      table.increments('id').primary();
      table.string('username', 50).unique().notNullable();
      table.string('password_hash', 255).notNullable();
      table.string('role', 20).defaultTo('admin');
      table.jsonb('permissions').defaultTo('{}');
      table.timestamp('last_login');
      table.timestamps(true, true);
    })

    // Customers table
    .createTable('customers', function(table) {
      table.increments('id').primary();
      table.string('nama', 255).notNullable();
      table.string('nomor_hp', 20).unique().notNullable();
      table.string('email', 255);
      table.boolean('status_aktif').defaultTo(true);
      table.decimal('credit_balance', 10, 2).defaultTo(0);
      table.decimal('debt_balance', 10, 2).defaultTo(0);
      table.text('notes');
      table.timestamps(true, true);
    })

    // Settings table
    .createTable('settings', function(table) {
      table.increments('id').primary();
      table.string('key', 100).unique().notNullable();
      table.text('value').notNullable();
      table.text('description');
      table.timestamps(true, true);
    })

    // Profiles table
    .createTable('profiles', function(table) {
      table.increments('id').primary();
      table.string('name', 100).unique().notNullable();
      table.enum('type', ['hotspot', 'pppoe']).notNullable();
      table.decimal('price_cost', 10, 2).defaultTo(0);
      table.decimal('price_sell', 10, 2).defaultTo(0);
      table.integer('duration').defaultTo(0);
      table.string('duration_unit', 20).defaultTo('minutes');
      table.string('bandwidth_up', 50);
      table.string('bandwidth_down', 50);
      table.string('data_limit', 50);
      table.string('mikrotik_name', 100);
      table.boolean('mikrotik_synced').defaultTo(false);
      table.string('comment_marker', 100);
      table.timestamps(true, true);
    })

    // Vouchers table
    .createTable('vouchers', function(table) {
      table.increments('id').primary();
      table.string('kode', 50).unique().notNullable();
      table.string('profile_name', 100).notNullable();
      table.decimal('price_sell', 10, 2).notNullable();
      table.enum('status', ['available', 'sold', 'used', 'expired']).defaultTo('available');
      table.timestamp('expires_at');
      table.timestamp('used_at');
      table.string('used_by', 100);
      table.timestamps(true, true);
    })

    // PPPoE users table
    .createTable('pppoe_users', function(table) {
      table.increments('id').primary();
      table.string('username', 100).unique().notNullable();
      table.string('password', 100).notNullable();
      table.string('profile_name', 100).notNullable();
      table.integer('customer_id').references('id').inTable('customers');
      table.enum('status', ['active', 'disabled', 'expired']).defaultTo('active');
      table.timestamp('expires_at');
      table.timestamp('last_login');
      table.string('mikrotik_name', 100);
      table.timestamps(true, true);
    })

    // Subscriptions table
    .createTable('subscriptions', function(table) {
      table.increments('id').primary();
      table.integer('customer_id').references('id').inTable('customers').notNullable();
      table.enum('service_type', ['hotspot', 'pppoe']).notNullable();
      table.string('profile_name', 100).notNullable();
      table.string('username', 100);
      table.enum('billing_cycle', ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'onetime']).defaultTo('onetime');
      table.decimal('price_sell', 10, 2).notNullable();
      table.decimal('price_cost', 10, 2).notNullable();
      table.enum('status', ['active', 'expired', 'cancelled']).defaultTo('active');
      table.boolean('auto_renew').defaultTo(false);
      table.date('expiry_date');
      table.date('next_billing_date');
      table.timestamps(true, true);
    })

    // Payments table
    .createTable('payments', function(table) {
      table.increments('id').primary();
      table.integer('customer_id').references('id').inTable('customers');
      table.integer('subscription_id').references('id').inTable('subscriptions');
      table.decimal('amount', 10, 2).notNullable();
      table.string('payment_method', 50).notNullable();
      table.enum('payment_status', ['pending', 'paid', 'failed', 'cancelled']).defaultTo('pending');
      table.string('transaction_id', 100);
      table.text('notes');
      table.timestamps(true, true);
    })

    // System logs table
    .createTable('system_logs', function(table) {
      table.increments('id').primary();
      table.enum('level', ['ERROR', 'WARN', 'WARNING', 'INFO', 'DEBUG', 'CRITICAL', 'ALERT']).notNullable();
      table.string('module', 100).notNullable();
      table.text('message').notNullable();
      table.jsonb('details');
      table.integer('user_id').references('id').inTable('admin_users').onDelete('SET NULL');
      table.specificType('ip_address', 'inet');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('system_logs')
    .dropTableIfExists('payments')
    .dropTableIfExists('subscriptions')
    .dropTableIfExists('pppoe_users')
    .dropTableIfExists('vouchers')
    .dropTableIfExists('profiles')
    .dropTableIfExists('settings')
    .dropTableIfExists('customers')
    .dropTableIfExists('admin_users');
};