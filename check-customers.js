require('dotenv').config();
const { DatabaseManager } = require('./src/database/DatabaseManager');

async function checkCustomers() {
    const db = new DatabaseManager();

    try {
        await db.initialize();
        console.log('Connected to database');

        // Check all customers
        const result = await db.query('SELECT * FROM customers ORDER BY id DESC');
        console.log('Customers found:', result.rows);

        // Check active customers specifically
        const activeResult = await db.query('SELECT * FROM customers WHERE is_active = true ORDER BY id DESC');
        console.log('Active customers:', activeResult.rows);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.close();
    }
}

checkCustomers();