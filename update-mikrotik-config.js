const { db } = require('./src/database/DatabaseManager');

async function updateMikrotikConfig() {
  try {
    // Update Mikrotik settings in database
    await db.query("UPDATE settings SET value = '54.37.252.142' WHERE key = 'mikrotik_host'");
    await db.query("UPDATE settings SET value = '8728' WHERE key = 'mikrotik_port'");
    await db.query("UPDATE settings SET value = 'userku' WHERE key = 'mikrotik_username'");
    await db.query("UPDATE settings SET value = 'ganteng' WHERE key = 'mikrotik_password'");
    await db.query("UPDATE settings SET value = 'false' WHERE key = 'mikrotik_use_ssl'");

    console.log('✅ Mikrotik config updated in database');

    // Verify update
    const settings = await db.query("SELECT * FROM settings WHERE key LIKE 'mikrotik%'");
    console.log('Updated settings:');
    settings.rows.forEach(s => {
      console.log(`  ${s.key}: ${s.value}`);
    });

  } catch (error) {
    console.error('❌ Error updating config:', error.message);
  }
}

updateMikrotikConfig();