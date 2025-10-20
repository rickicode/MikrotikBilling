#!/usr/bin/env node

const { RouterOSClient } = require('mikro-routeros');

const credentials = [
    { username: 'userku', password: 'admin123' },
    { username: 'userku', password: 'admin' },
    { username: 'userku', password: 'password' },
    { username: 'userku', password: '123456' },
    { username: 'userku', password: 'userku' },
    { username: 'admin', password: 'admin123' },
    { username: 'admin', password: 'admin' },
    { username: 'admin', password: 'password' },
    { username: 'admin', password: '123456' },
    { username: 'admin', password: '' },
    { username: 'mikrotik', password: 'mikrotik' }
];

async function testCredentials() {
    console.log('🔌 Testing Mikrotik Credentials...');
    console.log('Host: 54.37.252.142');
    console.log('Port: 8728');
    console.log('---');

    for (const cred of credentials) {
        console.log(`\n🔐 Testing: ${cred.username}/${cred.password}`);
        const client = new RouterOSClient('54.37.252.142', 8728, 10000);

        try {
            await client.connect();
            await client.login(cred.username, cred.password);

            console.log(`✅ SUCCESS! Authentication worked with: ${cred.username}/${cred.password}`);

            // Test basic query
            const identity = await client.runQuery('/system/identity/print');
            console.log('📋 Router Identity:', JSON.stringify(identity, null, 2));

            await client.close();
            return cred;

        } catch (error) {
            if (error.message.includes('invalid user name or password')) {
                console.log('❌ Invalid credentials');
            } else {
                console.log('❌ Other error:', error.message);
            }

            try {
                await client.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    }

    console.log('\n❌ No valid credentials found');
    return null;
}

testCredentials();