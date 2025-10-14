const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mikrotik_billing',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin'
});

async function checkAndUpdateWhatsAppSessionsTable() {
    const client = await pool.connect();
    try {
        console.log('Checking WhatsApp sessions table structure...');

        // Check if table exists
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'whatsapp_sessions'
            )
        `);

        if (!tableExists.rows[0].exists) {
            console.log('Table does not exist. Creating new table...');
            await client.query(`
                CREATE TABLE whatsapp_sessions (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) UNIQUE NOT NULL,
                    session_name VARCHAR(255) NOT NULL,
                    session_type VARCHAR(50) DEFAULT 'personal',
                    phone_number VARCHAR(20),
                    status VARCHAR(50) DEFAULT 'disconnected',
                    is_active BOOLEAN DEFAULT true,
                    is_default BOOLEAN DEFAULT false,
                    priority INTEGER DEFAULT 0,
                    qr_code TEXT,
                    connected_at TIMESTAMP,
                    last_activity TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Table created successfully');
        } else {
            console.log('Table exists. Checking structure...');

            // Get current table structure
            const structure = await client.query(`
                SELECT column_name, data_type, column_default
                FROM information_schema.columns
                WHERE table_name = 'whatsapp_sessions'
                ORDER BY ordinal_position
            `);

            console.log('\nCurrent table structure:');
            structure.rows.forEach(col => {
                console.log(`- ${col.column_name}: ${col.data_type} (${col.column_default})`);
            });

            // Check for missing columns and add them
            const requiredColumns = [
                { name: 'session_type', type: 'VARCHAR(50)', default: 'DEFAULT \'personal\'' },
                { name: 'phone_number', type: 'VARCHAR(20)', default: null },
                { name: 'status', type: 'VARCHAR(50)', default: 'DEFAULT \'disconnected\'' },
                { name: 'is_active', type: 'BOOLEAN', default: 'DEFAULT true' },
                { name: 'is_default', type: 'BOOLEAN', default: 'DEFAULT false' },
                { name: 'priority', type: 'INTEGER', default: 'DEFAULT 0' },
                { name: 'qr_code', type: 'TEXT', default: null },
                { name: 'connected_at', type: 'TIMESTAMP', default: null },
                { name: 'last_activity', type: 'TIMESTAMP', default: null },
                { name: 'updated_at', type: 'TIMESTAMP', default: 'DEFAULT CURRENT_TIMESTAMP' }
            ];

            const existingColumns = structure.rows.map(row => row.column_name);

            for (const col of requiredColumns) {
                if (!existingColumns.includes(col.name)) {
                    console.log(`Adding column: ${col.name}`);
                    await client.query(`
                        ALTER TABLE whatsapp_sessions
                        ADD COLUMN ${col.name} ${col.type} ${col.default}
                    `);
                    console.log(`Column ${col.name} added successfully`);
                }
            }

            // Create indexes
            await client.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_session_id ON whatsapp_sessions(session_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_is_active ON whatsapp_sessions(is_active)`);

            // Create trigger function for updated_at
            await client.query(`
                CREATE OR REPLACE FUNCTION update_whatsapp_sessions_updated_at()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql'
            `);

            // Create trigger
            await client.query(`
                DROP TRIGGER IF EXISTS trigger_update_whatsapp_sessions_updated_at ON whatsapp_sessions
            `);

            await client.query(`
                CREATE TRIGGER trigger_update_whatsapp_sessions_updated_at
                    BEFORE UPDATE ON whatsapp_sessions
                    FOR EACH ROW
                    EXECUTE FUNCTION update_whatsapp_sessions_updated_at()
            `);
        }

        // Check if sample data exists
        const existingData = await client.query('SELECT COUNT(*) FROM whatsapp_sessions');
        const count = parseInt(existingData.rows[0].count);

        if (count === 0) {
            console.log('Inserting sample data...');
            // Insert sample data
            await client.query(`
                INSERT INTO whatsapp_sessions (session_id, session_name, session_type, phone_number, status, is_active, is_default, priority) VALUES
                ('session_main', 'Main Account', 'personal', '+628123456789', 'disconnected', true, true, 100),
                ('session_support', 'Support Team', 'support', '+628987654321', 'disconnected', true, false, 80),
                ('session_notification', 'Notification Bot', 'notification', '+628112233445', 'disconnected', true, false, 60)
            `);
            console.log('Sample data inserted successfully');
        } else {
            console.log(`Table already has ${count} records`);
        }

        console.log('\nWhatsApp sessions table setup complete!');

        // Display current data
        const result = await client.query('SELECT * FROM whatsapp_sessions ORDER BY priority DESC, session_name');
        console.log('\nCurrent sessions:');
        result.rows.forEach(session => {
            console.log(`- ${session.session_name} (${session.session_id}) - Status: ${session.status}, Type: ${session.session_type || 'N/A'}, Priority: ${session.priority || 0}`);
        });

    } catch (error) {
        console.error('Error setting up WhatsApp sessions table:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkAndUpdateWhatsAppSessionsTable();