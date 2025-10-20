#!/usr/bin/env node

// Test voucher generation in Mikrotik Billing System
const DatabaseConfig = require('./src/config/database');
const MikrotikClient = require('./src/services/MikrotikClient');

async function testVoucherGeneration() {
    console.log('🎫 Testing Voucher Generation System...');
    console.log('='.repeat(50));

    let db, mikrotik;

    try {
        // Initialize database
        console.log('📊 Initializing database connection...');
        db = new DatabaseConfig();
        const pool = db.getPrimaryPool();

        // Initialize Mikrotik client
        console.log('🔌 Initializing Mikrotik client...');
        mikrotik = new MikrotikClient(db);
        await mikrotik.loadConfig();

        console.log('📋 Mikrotik Config:', mikrotik.getConnectionInfo());

        // Test 1: Create voucher in database
        console.log('\n🎯 Test 1: Creating voucher in database...');
        const voucherData = {
            code: 'TEST' + Date.now(),
            password: 'test123',
            profile_id: null,
            status: 'active',
            price_sell: 5000,
            price_cost: 3000,
            duration_hours: 24,
            expired_hours: 72,
            created_at: new Date()
        };

        const insertResult = await pool.query(
            `INSERT INTO vouchers (code, password, profile_id, status, price_sell, price_cost, duration_hours, expired_hours, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [voucherData.code, voucherData.password, voucherData.profile_id, voucherData.status,
             voucherData.price_sell, voucherData.price_cost, voucherData.duration_hours,
             voucherData.expired_hours, voucherData.created_at]
        );

        console.log('✅ Voucher created in database:', insertResult.rows[0]);

        // Test 2: Try to create voucher in Mikrotik
        console.log('\n🎯 Test 2: Creating voucher in Mikrotik...');

        // Check if Mikrotik is connected
        const connectionInfo = mikrotik.getConnectionInfo();
        console.log('📡 Connection Status:', connectionInfo.status);

        if (connectionInfo.connected) {
            try {
                // Get available profiles
                const profiles = await mikrotik.getHotspotProfiles();
                console.log('📊 Available profiles:', profiles.map(p => p.name));

                // Create voucher user in Mikrotik
                const voucherUser = {
                    username: voucherData.code,
                    password: voucherData.password,
                    profile: profiles[0]?.name || 'default',
                    price_sell: voucherData.price_sell.toString(),
                    expired_hours: voucherData.expired_hours,
                    never_expired: voucherData.expired_hours === 0
                };

                console.log('🎫 Creating voucher user in Mikrotik:', voucherUser);
                const mikrotikResult = await mikrotik.createVoucherUser(voucherUser);
                console.log('✅ Voucher created in Mikrotik:', mikrotikResult);

                // Test 3: Verify voucher exists in Mikrotik
                console.log('\n🎯 Test 3: Verifying voucher in Mikrotik...');
                const createdUser = await mikrotik.findHotspotUser(voucherData.code);

                if (createdUser) {
                    console.log('✅ Voucher found in Mikrotik:');
                    console.log('   Username:', createdUser.name);
                    console.log('   Profile:', createdUser.profile);
                    console.log('   Comment:', createdUser.comment);
                    console.log('   Disabled:', createdUser.disabled);

                    // Parse comment to verify voucher system pattern
                    const commentData = MikrotikClient.parseVoucherComment(createdUser.comment);
                    if (commentData) {
                        console.log('🎫 Voucher comment parsed successfully:');
                        console.log('   System:', commentData.system);
                        console.log('   Type:', commentData.type);
                        console.log('   Price Sell:', commentData.price_sell);
                        console.log('   First Login:', commentData.first_login_timestamp);
                        console.log('   Valid Until:', commentData.valid_until_timestamp);
                        console.log('   Status:', commentData.status);
                    }
                } else {
                    console.log('❌ Voucher not found in Mikrotik');
                }

            } catch (mikrotikError) {
                console.log('❌ Mikrotik operation failed:', mikrotikError.message);
                console.log('ℹ️ This is expected when Mikrotik is offline');
            }
        } else {
            console.log('⚠️ Mikrotik is offline - testing offline mode');
            console.log('ℹ️ In offline mode, vouchers are stored in database but not created in RouterOS');
            console.log('ℹ️ They will be synced when Mikrotik comes back online');
        }

        // Test 4: Test Mikrotik integration verification
        console.log('\n🎯 Test 4: Testing RouterOS integration verification...');
        try {
            const integrationResult = await mikrotik.ensureRouterOSIntegration();
            console.log('✅ RouterOS integration verification completed:', integrationResult);
        } catch (integrationError) {
            console.log('❌ RouterOS integration failed:', integrationError.message);
        }

        // Test 5: Test health check
        console.log('\n🎯 Test 5: Testing Mikrotik health check...');
        try {
            const healthResult = await mikrotik.healthCheck();
            console.log('✅ Health check result:', healthResult);
        } catch (healthError) {
            console.log('❌ Health check failed:', healthError.message);
        }

        console.log('\n🎉 Voucher generation testing completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        // Cleanup
        try {
            if (mikrotik) {
                await mikrotik.disconnect();
            }
            if (db) {
                await db.close();
            }
        } catch (cleanupError) {
            console.warn('Warning: Error during cleanup:', cleanupError.message);
        }
    }
}

testVoucherGeneration();