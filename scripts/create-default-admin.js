const { Client } = require('pg');
const bcrypt = require('bcrypt');

// Koneksi ke database Supabase
const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.hvylyfmdhrruzlyclkgw:p1kunPISAN@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
});

async function createDefaultAdmin() {
    try {
        await client.connect();
        console.log('Terhubung ke database Supabase...');

        // Check if admin user exists
        const existingAdmin = await client.query(
            'SELECT id FROM admin_users WHERE username = $1',
            ['admin']
        );

        if (!existingAdmin || existingAdmin.rows.length === 0) {
            // Hash password
            const hashedPassword = await bcrypt.hash('admin123', 10);

            // Insert default admin user
            await client.query(`
                INSERT INTO admin_users (username, password, name, email, role, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            `, [
                'admin',
                hashedPassword,
                'Administrator',
                'admin@mikrotik.com',
                'super_admin',
                'active'
            ]);

            console.log('✓ Default admin user created: admin/admin123');
        } else {
            console.log('- Admin user already exists');
        }

        // Check if user_sessions table exists
        const userSessionsTable = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'user_sessions'
            )
        `);

        if (!userSessionsTable.rows[0].exists) {
            // Create user_sessions table
            await client.query(`
                CREATE TABLE user_sessions (
                    id SERIAL PRIMARY KEY,
                    admin_id INTEGER NOT NULL,
                    session_token VARCHAR(255) UNIQUE NOT NULL,
                    ip_address INET,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
                )
            `);

            console.log('✓ Created user_sessions table');
        } else {
            console.log('- user_sessions table already exists');
        }

        console.log('\n✅ Admin setup completed!');

    } catch (error) {
        console.error('❌ Error creating default admin:', error);
    } finally {
        await client.end();
        process.exit(0);
    }
}

createDefaultAdmin();