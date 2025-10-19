#!/usr/bin/env node

/**
 * Payment Integration Test Runner
 *
 * Run this script to test the complete payment integration
 */

const { db } = require('./src/database/DatabaseManager');
const PaymentIntegrationTest = require('./src/test/payment-integration.test');

async function runPaymentTests() {
    console.log('🚀 Starting Payment Integration Tests\n');

    try {
        // Check database connection
        console.log('🔌 Checking database connection...');
        const testQuery = await db.query('SELECT 1 as test');
        if (testQuery && testQuery.length > 0) {
            console.log('✅ Database connection successful\n');
        } else {
            throw new Error('Database connection failed');
        }

        // Initialize and run tests
        const paymentTest = new PaymentIntegrationTest(db);
        await paymentTest.runAllTests();

    } catch (error) {
        console.error('❌ Test runner failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runPaymentTests()
        .then(() => {
            console.log('\n✨ Payment integration tests completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Payment integration tests failed:', error);
            process.exit(1);
        });
}

module.exports = { runPaymentTests };