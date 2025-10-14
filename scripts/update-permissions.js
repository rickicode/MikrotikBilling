require('dotenv').config();
const DatabasePostgreSQL = require('../src/database/DatabasePostgreSQL');

async function updateExistingPermissions() {
  const db = new DatabasePostgreSQL();
  await db.initialize();

  try {
    console.log('Updating permissions for existing admin users...');

    // Update existing admin users to have default permissions (only if they're still empty)
    const result = await db.query(`
      UPDATE admin_users
      SET permissions = CASE
        WHEN role = 'super_admin' THEN '{"all": true}'::jsonb
        WHEN role = 'admin' THEN '{"customers": true, "vouchers": true, "pppoe": true, "reports": true}'::jsonb
        WHEN role = 'operator' THEN '{"customers": true, "vouchers": true}'::jsonb
        ELSE '{}'::jsonb
      END
      WHERE permissions = '{}'::jsonb OR permissions IS NULL
    `);

    console.log(`✅ Updated ${result.rowCount} users with default permissions`);

    // Verify updates
    const users = await db.query('SELECT id, username, role, permissions FROM admin_users ORDER BY id');
    console.log('\nCurrent admin users:');
    users.forEach(user => {
      console.log(`ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, Permissions: ${JSON.stringify(user.permissions)}`);
    });

  } catch (error) {
    console.error('Error updating permissions:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run if called directly
if (require.main === module) {
  updateExistingPermissions()
    .then(() => {
      console.log('Permissions update completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Permissions update failed:', error);
      process.exit(1);
    });
}

module.exports = { updateExistingPermissions };