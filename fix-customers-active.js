require('dotenv').config();
const { DatabaseManager } = require('./src/database/DatabaseManager');

async function fixCustomerActiveStatus() {
    const db = new DatabaseManager();

    try {
        await db.initialize();
        console.log('Connected to database');

        // Update existing customers to set is_active = true
        const result = await db.query(`
            UPDATE customers
            SET is_active = true
            WHERE is_active = false
        `);

        console.log(`Updated ${result.rowCount} customers to active status`);

        // Check customers after update
        const customersResult = await db.query('SELECT id, name, phone, is_active FROM customers ORDER BY id DESC');
        console.log('Customers after fix:');
        customersResult.rows.forEach(customer => {
            console.log(`- ${customer.name} (ID: ${customer.id}) - Phone: ${customer.phone} - Active: ${customer.is_active}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.close();
    }
}

fixCustomerActiveStatus();