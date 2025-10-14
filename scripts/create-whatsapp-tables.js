const { db } = require('../src/database/DatabaseManager');
const fs = require('fs');
const path = require('path');

async function createWhatsAppTables() {
    try {
        console.log('📱 Creating WhatsApp tables...');

        // Read the migration file
        const migrationPath = path.join(__dirname, '../migrations/006_create_whatsapp_system.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Split the migration into individual statements
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('--'));

        // Execute each statement
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await db.query(statement);
                    console.log('✅ Executed:', statement.substring(0, 50) + '...');
                } catch (error) {
                    // Ignore errors if tables already exist
                    if (error.message.includes('already exists')) {
                        console.log('⚠️  Table already exists:', statement.substring(0, 50) + '...');
                    } else {
                        console.error('❌ Error executing statement:', error.message);
                        console.error('Statement:', statement);
                    }
                }
            }
        }

        console.log('✅ WhatsApp tables created successfully!');

        // Check if the trigger function exists
        const triggerExists = await db.query(`
            SELECT 1 FROM information_schema.routines
            WHERE routine_name = 'update_updated_at_column'
        `);

        // If trigger function doesn't exist, create it
        if (triggerExists.length === 0) {
            await db.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            `);
            console.log('✅ Created update_updated_at_column function');
        }

        await db.destroy();
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to create WhatsApp tables:', error);
        process.exit(1);
    }
}

createWhatsAppTables();