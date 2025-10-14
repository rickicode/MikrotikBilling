const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function globalSetup(config) {
  console.log('🔧 Setting up test environment...');

  // Check if PostgreSQL is running
  try {
    execSync('pg_isready', { stdio: 'pipe' });
    console.log('✅ PostgreSQL is running');
  } catch (error) {
    console.error('❌ PostgreSQL is not running. Please start PostgreSQL first.');
    process.exit(1);
  }

  // Check if test database exists
  const testDbName = process.env.TEST_DB_NAME || 'mikrotik_billing_test';

  try {
    execSync(`psql -lqt | cut -d \\| -f 1 | grep -qw ${testDbName}`, { stdio: 'pipe' });
    console.log(`✅ Test database '${testDbName}' exists`);
  } catch (error) {
    console.log(`📝 Creating test database '${testDbName}'...`);
    try {
      execSync(`createdb ${testDbName}`, { stdio: 'pipe' });
      console.log('✅ Test database created');
    } catch (createError) {
      console.error('❌ Failed to create test database:', createError.message);
    }
  }

  // Run migrations if needed
  if (process.env.RUN_MIGRATIONS !== 'false') {
    console.log('🔄 Running database migrations...');
    try {
      execSync('npm run migrate', { stdio: 'pipe' });
      console.log('✅ Migrations completed');
    } catch (migrateError) {
      console.error('❌ Migration failed:', migrateError.message);
    }
  }

  // Create test admin user if not exists
  const createTestAdmin = `
    INSERT INTO admin_users (username, password_hash, role, permissions)
    VALUES ('admin', '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQ', 'super_admin', '{}')
    ON CONFLICT (username) DO NOTHING;
  `;

  try {
    execSync(`psql -d ${testDbName} -c "${createTestAdmin}"`, { stdio: 'pipe' });
    console.log('✅ Test admin user ready');
  } catch (error) {
    console.warn('⚠️ Could not create test admin user:', error.message);
  }

  console.log('✅ Test environment setup complete!');
}

module.exports = globalSetup;