const RouterOSClient = require('routeros-client');

async function verifyPPPoEUsers() {
    console.log('🔍 Verifying PPPoE Users in RouterOS...');
    
    const conn = new RouterOSClient({
        host: '54.37.252.142',
        port: 8728,
        username: 'userku',
        password: 'M4k4s4rB4ng',
        timeout: 10000
    });

    try {
        console.log('📡 Connecting to RouterOS...');
        await conn.connect();
        console.log('✅ Connected to RouterOS successfully');

        // Get all PPP secrets
        console.log('\n📋 Retrieving all PPP secrets...');
        const secrets = await conn.write('/ppp/secret/print');
        
        console.log('✅ Retrieved ' + secrets.length + ' PPP secrets');
        
        if (secrets.length === 0) {
            console.log('❌ No PPP secrets found');
            return;
        }

        // Display all secrets
        console.log('\n📄 PPP Secrets List:');
        console.log('==================');
        
        let pppoeCount = 0;
        let testUsersFound = 0;
        
        secrets.forEach((secret, index) => {
            const service = secret.service || 'N/A';
            const name = secret.name || 'N/A';
            const profile = secret.profile || 'N/A';
            const comment = secret.comment || 'N/A';
            const disabled = secret.disabled || 'false';
            
            console.log('\n' + (index + 1) + '. Name: ' + name);
            console.log('   Service: ' + service);
            console.log('   Profile: ' + profile);
            console.log('   Comment: ' + comment);
            console.log('   Disabled: ' + disabled);
            
            if (service === 'pppoe') {
                pppoeCount++;
                console.log('   >>> This is a PPPoE user');
                
                // Check if this is one of our test users
                if (name.includes('testpppoe')) {
                    testUsersFound++;
                    console.log('   >>> TEST USER FOUND! <<<');
                }
            }
        });
        
        console.log('\n📊 Summary:');
        console.log('Total PPP secrets: ' + secrets.length);
        console.log('PPPoE users: ' + pppoeCount);
        console.log('Test users created: ' + testUsersFound);
        
        // Check specifically for test users
        if (testUsersFound > 0) {
            console.log('\n✅ SUCCESS: Test PPPoE users were created in RouterOS!');
            
            // Get detailed info about test users
            console.log('\n🔍 Detailed Test User Information:');
            secrets.forEach((secret) => {
                if (secret.name && secret.name.includes('testpppoe')) {
                    console.log('------------------------');
                    console.log('Name: ' + secret.name);
                    console.log('Service: ' + secret.service);
                    console.log('Profile: ' + secret.profile);
                    console.log('Comment: ' + secret.comment);
                    console.log('Disabled: ' + secret.disabled);
                    console.log('Caller-ID: ' + (secret['caller-id'] || 'N/A'));
                    console.log('Limit Bytes In: ' + (secret['limit-bytes-in'] || 'N/A'));
                    console.log('Limit Bytes Out: ' + (secret['limit-bytes-out'] || 'N/A'));
                }
            });
        } else {
            console.log('\n❌ FAILED: No test PPPoE users found in RouterOS');
            console.log('This means the web interface did not successfully create users in RouterOS');
        }

        // Try to get more detailed PPPoE information
        console.log('\n🔍 Getting active PPPoE connections...');
        try {
            const active = await conn.write('/ppp/active/print');
            console.log('Active PPP connections: ' + active.length);
            
            active.forEach((conn, index) => {
                if (conn.name && conn.name.includes('testpppoe')) {
                    console.log('Active test connection found:');
                    console.log('  Name: ' + conn.name);
                    console.log('  Address: ' + (conn.address || 'N/A'));
                    console.log('  Uptime: ' + (conn.uptime || 'N/A'));
                }
            });
        } catch (error) {
            console.log('Could not get active connections:', error.message);
        }

    } catch (error) {
        console.error('❌ RouterOS connection failed:', error.message);
        
        if (error.message.includes('timeout')) {
            console.log('💡 This could be due to:');
            console.log('   - Network connectivity issues');
            console.log('   - RouterOS API disabled');
            console.log('   - Wrong credentials or port');
        }
    } finally {
        if (conn && conn.close) {
            await conn.close();
            console.log('🔌 Disconnected from RouterOS');
        }
    }
}

// Run the verification
verifyPPPoEUsers().catch(console.error);
