// Use existing MikrotikClient to check PPPoE users
const { MikrotikClient } = require("./src/mikrotik/MikrotikClient.js");

async function checkPPPoEUsersInMikrotik() {
    console.log('🚀 Starting PPPoE Users Verification in Mikrotik...');
    
    const client = new MikrotikClient({
        host: '54.37.252.142',
        port: 8728,
        username: 'userku',
        password: 'M4k4s4rB4ng',
        timeout: 10000
    });

    try {
        console.log('📡 Connecting to Mikrotik RouterOS...');
        await client.connect();
        console.log('✅ Connected to Mikrotik successfully');

        // Get all PPP secrets (includes PPPoE users)
        console.log('\n📋 Retrieving PPP secrets...');
        const secrets = await client.write('/ppp/secret/print');
        
        console.log('✅ Retrieved ' + secrets.length + ' PPP secrets');
        
        if (secrets.length === 0) {
            console.log('❌ No PPP secrets found in RouterOS');
            return;
        }

        // Analyze the secrets
        let pppoeCount = 0;
        let testUsersFound = 0;
        let recentTestUsers = [];
        
        console.log('\n📄 Analyzing PPP Secrets:');
        console.log('==========================');
        
        secrets.forEach((secret, index) => {
            const service = secret.service || 'N/A';
            const name = secret.name || 'N/A';
            const profile = secret.profile || 'N/A';
            const comment = secret.comment || 'N/A';
            const disabled = secret.disabled === 'true' || disabled === 'yes';
            
            console.log('\n' + (index + 1) + '. Username: ' + name);
            console.log('   Service: ' + service);
            console.log('   Profile: ' + profile);
            console.log('   Comment: ' + comment);
            console.log('   Disabled: ' + disabled);
            
            if (service === 'pppoe') {
                pppoeCount++;
                console.log('   >>> This is a PPPoE user');
                
                // Check if this is one of our test users
                if (name && name.includes('testpppoe')) {
                    testUsersFound++;
                    recentTestUsers.push({
                        name: name,
                        profile: profile,
                        comment: comment,
                        disabled: disabled
                    });
                    console.log('   >>> 🧪 TEST USER FOUND! <<<');
                }
            }
        });
        
        console.log('\n📊 SUMMARY:');
        console.log('================');
        console.log('Total PPP secrets: ' + secrets.length);
        console.log('PPPoE users: ' + pppoeCount);
        console.log('Test users created: ' + testUsersFound);
        
        // Detailed analysis of test users
        if (testUsersFound > 0) {
            console.log('\n✅ SUCCESS: Test PPPoE users were created in RouterOS!');
            console.log('\n🔍 DETAILED TEST USER ANALYSIS:');
            console.log('=================================');
            
            recentTestUsers.forEach((user, index) => {
                console.log('\nTest User ' + (index + 1) + ':');
                console.log('  Username: ' + user.name);
                console.log('  Profile: ' + user.profile);
                console.log('  Comment: ' + user.comment);
                console.log('  Status: ' + (user.disabled ? 'DISABLED' : 'ACTIVE'));
                
                // Check if comment contains PPPoE system metadata
                if (user.comment && user.comment.includes('PPPOE_SYSTEM')) {
                    console.log('  ✅ Has proper PPPoE system comment');
                    const commentParts = user.comment.split('|');
                    if (commentParts.length >= 3) {
                        console.log('  📝 Comment structure: ' + commentParts.join(' | '));
                        console.log('    - System: ' + commentParts[0]);
                        console.log('    - Price: ' + commentParts[1]);
                        console.log('    - Created: ' + commentParts[2]);
                    }
                } else {
                    console.log('  ⚠️ Missing or incomplete PPPoE system comment');
                }
            });
        } else {
            console.log('\n❌ CRITICAL FAILURE: No test PPPoE users found in RouterOS');
            console.log('\n🔍 POSSIBLE REASONS:');
            console.log('1. Web interface form submission failed');
            console.log('2. Mikrotik connection issues in the application');
            console.log('3. Authentication/authorization problems');
            console.log('4. PPPoE service not properly configured');
            console.log('5. Form validation errors prevented creation');
        }

        // Check for active PPPoE connections
        console.log('\n🔍 Checking active PPPoE connections...');
        try {
            const activeConnections = await client.write('/interface/pppoe-server/print');
            console.log('PPPoE servers: ' + activeConnections.length);
            
            activeConnections.forEach((server, index) => {
                console.log('PPPoE Server ' + (index + 1) + ':');
                console.log('  Name: ' + (server.name || 'N/A'));
                console.log('  Interface: ' + (server.interface || 'N/A'));
                console.log('  Authentication: ' + (server.authentication || 'N/A'));
                console.log('  Default Profile: ' + (server['default-profile'] || 'N/A'));
            });
        } catch (error) {
            console.log('Could not get PPPoE server info:', error.message);
        }

        // Get available PPP profiles
        console.log('\n🔍 Checking available PPP profiles...');
        try {
            const profiles = await client.write('/ppp/profile/print');
            console.log('Available PPP profiles: ' + profiles.length);
            
            let pppoeProfiles = 0;
            profiles.forEach((profile, index) => {
                const name = profile.name || 'N/A';
                const isPPPoEProfile = profile.comment && profile.comment.includes('PPPOE_SYSTEM');
                
                if (isPPPoEProfile) {
                    pppoeProfiles++;
                    console.log('PPP Profile ' + (index + 1) + ' (PPPoE): ' + name);
                    console.log('  Comment: ' + profile.comment);
                }
            });
            
            console.log('PPPoE-specific profiles: ' + pppoeProfiles);
        } catch (error) {
            console.log('Could not get PPP profiles:', error.message);
        }

    } catch (error) {
        console.error('❌ Mikrotik connection failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Connection troubleshooting:');
            console.log('   - Check if Mikrotik API is enabled on port 8728');
            console.log('   - Verify network connectivity to 54.37.252.142');
            console.log('   - Confirm credentials are correct');
            console.log('   - Check firewall settings');
        }
    } finally {
        if (client && client.close) {
            try {
                await client.close();
                console.log('\n🔌 Disconnected from Mikrotik');
            } catch (e) {
                console.log('Warning: Could not close connection cleanly');
            }
        }
    }
}

// Run the verification
checkPPPoEUsersInMikrotik().catch(console.error);
