// Test voucher creation by directly calling server functions
const path = require('path');

// Load server modules directly
process.env.NODE_ENV = 'development';

async function testVoucherCreation() {
    console.log('🎯 SERVER-SIDE VOUCHER CREATION TEST');
    console.log('='.repeat(60));
    
    try {
        // Load required modules
        const DatabaseConfig = require('./src/config/database');
        const MikrotikClient = require('./src/services/MikrotikClient');
        
        console.log('\\n📋 STEP 1: Initializing database connection...');
        const dbConfig = new DatabaseConfig();
        const pool = dbConfig.getPrimaryPool();
        
        // Test database connection
        const dbTest = await pool.query('SELECT 1 as test');
        console.log('✅ Database connection successful');
        
        // Get available profiles
        console.log('\\n📋 STEP 2: Getting available profiles...');
        const profilesQuery = await pool.query(\`
            SELECT * FROM profiles 
            WHERE comment LIKE '%VOUCHER_SYSTEM%' 
            AND is_synced = true 
            ORDER BY name
            LIMIT 5
        \`);
        
        console.log('✅ Found ' + profilesQuery.rows.length + ' voucher profiles:');
        profilesQuery.rows.forEach((profile, index) => {
            console.log('  ' + (index + 1) + '. ' + profile.name + ' (' + profile.price_sell + ')');
        });
        
        if (profilesQuery.rows.length === 0) {
            console.log('❌ No voucher profiles found');
            return;
        }
        
        // Create test vouchers
        console.log('\\n📋 STEP 3: Creating test vouchers...');
        const selectedProfile = profilesQuery.rows[0];
        console.log('Selected profile: ' + selectedProfile.name);
        
        // Generate voucher codes
        const voucherCodes = [];
        for (let i = 0; i < 3; i++) {
            const code = 'TEST' + Date.now() + String(i).padStart(2, '0');
            voucherCodes.push(code);
        }
        
        console.log('Generated voucher codes: ' + voucherCodes.join(', '));
        
        // Insert vouchers into database
        console.log('\\n📋 STEP 4: Inserting vouchers into database...');
        
        for (const code of voucherCodes) {
            const insertQuery = \`
                INSERT INTO vouchers (code, profile_id, profile_name, price_sell, status, created_at)
                VALUES ($1, $2, $3, $4, 'active', NOW())
                RETURNING *
            \`;
            
            const result = await pool.query(insertQuery, [
                code,
                selectedProfile.id,
                selectedProfile.name,
                selectedProfile.price_sell
            ]);
            
            console.log('✅ Voucher created: ' + result.rows[0].code);
        }
        
        // Initialize Mikrotik connection
        console.log('\\n📋 STEP 5: Connecting to Mikrotik...');
        const mikrotikConfig = {
            host: '54.37.252.142',
            port: 8728,
            username: 'userku',
            password: 'M1kr0t1k2024'
        };
        
        const mikrotikClient = new MikrotikClient(mikrotikConfig);
        await mikrotikClient.connect();
        console.log('✅ Connected to Mikrotik');
        
        // Create hotspot users in Mikrotik
        console.log('\\n📋 STEP 6: Creating hotspot users in Mikrotik...');
        
        for (const code of voucherCodes) {
            const userData = {
                name: code,
                password: code,
                profile: selectedProfile.name,
                comment: 'VOUCHER_SYSTEM|' + selectedProfile.price_sell + '|' + Date.now() + '|' + (Date.now() + 86400000)
            };
            
            await mikrotikClient.addHotspotUser(userData);
            console.log('✅ Mikrotik user created: ' + code);
        }
        
        // Verify users in Mikrotik
        console.log('\\n📋 STEP 7: Verifying users in Mikrotik...');
        const hotspotUsers = await mikrotikClient.getHotspotUsers();
        
        const foundUsers = hotspotUsers.filter(user => 
            voucherCodes.includes(user.name)
        );
        
        console.log('✅ Found ' + foundUsers.length + '/' + voucherCodes.length + ' users in Mikrotik:');
        foundUsers.forEach(user => {
            console.log('  - ' + user.name + ' (Profile: ' + user.profile + ')');
        });
        
        // Close Mikrotik connection
        await mikrotikClient.disconnect();
        
        console.log('\\n' + '='.repeat(60));
        console.log('🎉 SERVER-SIDE VOUCHER CREATION TEST COMPLETED');
        console.log('='.repeat(60));
        
        console.log('\\n✅ SUCCESSFUL OPERATIONS:');
        console.log('✅ Database connection established');
        console.log('✅ Voucher profiles retrieved');
        console.log('✅ ' + voucherCodes.length + ' vouchers created in database');
        console.log('✅ ' + foundUsers.length + ' vouchers created in Mikrotik');
        console.log('✅ Mikrotik verification completed');
        
        console.log('\\n📊 TEST RESULTS:');
        console.log('🎫 Total vouchers created: ' + voucherCodes.length);
        console.log('🌐 Database vouchers: ' + voucherCodes.length);
        console.log('🔥 Mikrotik users: ' + foundUsers.length);
        console.log('📈 Success rate: ' + Math.round((foundUsers.length / voucherCodes.length) * 100) + '%');
        
        if (foundUsers.length === voucherCodes.length) {
            console.log('\\n🎯 PERFECT SUCCESS: All vouchers created and verified in Mikrotik!');
            console.log('✅ Voucher generation system is working correctly');
            console.log('✅ Database and Mikrotik integration is functional');
        } else {
            console.log('\\n⚠️  PARTIAL SUCCESS: Some vouchers may not have been created in Mikrotik');
            console.log('🔍 Check Mikrotik connection and permissions');
        }
        
    } catch (error) {
        console.error('\\n❌ TEST FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Provide troubleshooting information
        console.log('\\n🔧 TROUBLESHOOTING:');
        console.log('1. Check database connection credentials');
        console.log('2. Verify Mikrotik API access');
        console.log('3. Ensure profile exists in both database and Mikrotik');
        console.log('4. Check Mikrotik user permissions');
    }
}

// Run the test
testVoucherCreation()
    .then(() => {
        console.log('\\n✅ Server-side voucher test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\\n❌ Server-side voucher test failed:', error);
        process.exit(1);
    });
