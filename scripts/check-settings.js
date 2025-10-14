const { Client } = require('pg');

// Koneksi ke database Supabase
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.hvylyfmdhrruzlyclkgw:p1kunPISAN@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
});

async function checkSettings() {
    try {
        await client.connect();
        console.log('=== CHECKING SETTINGS ===\n');

        // Check settings table
        const settingsCount = await client.query('SELECT COUNT(*) as count FROM settings');
        console.log(`Total settings in database: ${settingsCount.rows[0].count}`);

        if (settingsCount.rows[0].count > 0) {
            console.log('\nKey settings:');
            const keySettings = await client.query(`
                SELECT key, value FROM settings
                WHERE key IN ('mikrotik_host', 'mikrotik_username', 'company_name')
                ORDER BY key
            `);

            keySettings.rows.forEach(s => {
                console.log(`  ${s.key}: ${s.value || '(empty)'}`);
            });
        }

        // Check admin users
        const adminCount = await client.query('SELECT COUNT(*) as count FROM admin_users');
        console.log(`\nTotal admin users: ${adminCount.rows[0].count}`);

        if (adminCount.rows[0].count > 0) {
            const admins = await client.query('SELECT username, role FROM admin_users');
            console.log('\nAdmin users:');
            admins.rows.forEach(a => {
                console.log(`  - ${a.username} (${a.role})`);
            });
        }

        // Check user_sessions table
        const sessionCount = await client.query('SELECT COUNT(*) as count FROM user_sessions');
        console.log(`\nActive sessions: ${sessionCount.rows[0].count}`);

        // Check Mikrotik connection settings from .env
        console.log('\n=== MIKROTIK CONFIG FROM .ENV ===');
        console.log(`Host: ${process.env.MIKROTIK_HOST}`);
        console.log(`Port: ${process.env.MIKROTIK_PORT}`);
        console.log(`Username: ${process.env.MIKROTIK_USERNAME}`);
        console.log(`Password: ${process.env.MIKROTIK_PASSWORD ? '***' : '(empty)'}`);

    } catch (error) {
        console.error('❌ Error checking settings:', error);
    } finally {
        await client.end();
        process.exit(0);
    }
}

checkSettings();