require('dotenv').config();
const { DatabaseManager } = require('./src/database/DatabaseManager');

async function fixVouchersTable() {
    const db = new DatabaseManager();

    try {
        await db.initialize();
        console.log('Connected to database');

        // Check if password column exists
        const result = await db.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'vouchers' AND column_name = 'password'
        `);

        if (result.rows.length === 0) {
            console.log('Adding password column to vouchers table...');
            await db.query('ALTER TABLE vouchers ADD COLUMN password VARCHAR(255)');
            console.log('Password column added successfully');
        } else {
            console.log('Password column already exists');
        }

        // Check if is_active column in customers table needs fixing
        const customersResult = await db.query(`
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name = 'is_active'
        `);

        console.log('Customers table is_active column type:', customersResult.rows[0]?.data_type);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.close();
    }
}

fixVouchersTable();