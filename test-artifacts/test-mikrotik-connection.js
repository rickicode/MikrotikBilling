#!/usr/bin/env node

const { RouterOSClient } = require('mikro-routeros');

async function testMikrotikConnection() {
    console.log('🔌 Testing Mikrotik Connection...');
    console.log('Host: 54.37.252.142');
    console.log('Port: 8728');
    console.log('Username: userku');
    console.log('---');

    const client = new RouterOSClient('54.37.252.142', 8728, 30000);

    try {
        console.log('📡 Establishing connection...');
        await client.connect();
        console.log('✅ Socket connected');

        console.log('🔐 Authenticating...');
        await client.login('userku', 'admin123');
        console.log('✅ Authentication successful');

        console.log('🔍 Testing identity query...');
        const identity = await client.runQuery('/system/identity/print');
        console.log('✅ Identity response:', JSON.stringify(identity, null, 2));

        console.log('📋 Testing hotspot user query...');
        const users = await client.runQuery('/ip/hotspot/user/print');
        console.log(`✅ Found ${users.length} hotspot users`);

        // Filter users with VOUCHER_SYSTEM comment
        const voucherUsers = users.filter(user => {
            if (user.comment && user.comment.includes('VOUCHER_SYSTEM')) {
                console.log(`🎫 Voucher user found: ${user.name} | Comment: ${user.comment}`);
                return true;
            }
            return false;
        });

        console.log(`🎫 Total voucher users: ${voucherUsers.length}`);

        console.log('📋 Testing PPPoE secret query...');
        const pppoeSecrets = await client.runQuery('/ppp/secret/print');
        console.log(`✅ Found ${pppoeSecrets.length} PPPoE secrets`);

        // Filter PPPoE users with system comments
        const systemPPPoE = pppoeSecrets.filter(secret => {
            if (secret.comment && (secret.comment.includes('pppoe') || secret.comment.includes('system'))) {
                console.log(`👤 PPPoE user found: ${secret.name} | Comment: ${secret.comment}`);
                return true;
            }
            return false;
        });

        console.log(`👤 Total system PPPoE users: ${systemPPPoE.length}`);

        console.log('📋 Testing hotspot profiles...');
        const profiles = await client.runQuery('/ip/hotspot/user/profile/print');
        console.log(`✅ Found ${profiles.length} hotspot profiles`);

        profiles.forEach(profile => {
            console.log(`📊 Profile: ${profile.name} | Rate Limit: ${profile['rate-limit'] || 'Not set'}`);
        });

        console.log('✅ All tests completed successfully!');

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('Stack:', error.stack);

        if (error.message.includes('timeout')) {
            console.log('🕐 Connection timeout - possible network issue');
        } else if (error.message.includes('login') || error.message.includes('authentication')) {
            console.log('🔐 Authentication failed - check credentials');
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
            console.log('🔌 Connection refused - check host/port');
        }

        process.exit(1);
    } finally {
        try {
            await client.close();
            console.log('🔌 Connection closed');
        } catch (error) {
            console.warn('Warning: Error closing connection:', error.message);
        }
    }
}

testMikrotikConnection();