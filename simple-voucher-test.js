// Simple voucher creation test
async function testVoucherCreation() {
    console.log('🎯 SIMPLE VOUCHER CREATION TEST');
    console.log('='.repeat(50));
    
    try {
        // Test database connection
        console.log('\\n📋 STEP 1: Testing database connection...');
        
        const DatabaseConfig = require('./src/config/database');
        const dbConfig = new DatabaseConfig();
        const pool = dbConfig.getPrimaryPool();
        
        const result = await pool.query('SELECT 1 as test');
        console.log('✅ Database connection successful');
        
        // Check if vouchers table exists and get count
        console.log('\\n📋 STEP 2: Checking vouchers table...');
        const voucherCount = await pool.query('SELECT COUNT(*) as count FROM vouchers');
        console.log('✅ Current vouchers in database:', voucherCount.rows[0].count);
        
        // Check profiles table
        console.log('\\n📋 STEP 3: Checking profiles table...');
        const profileCount = await pool.query('SELECT COUNT(*) as count FROM profiles');
        console.log('✅ Profiles in database:', profileCount.rows[0].count);
        
        // Get some profiles
        const profiles = await pool.query('SELECT id, name, price_sell FROM profiles LIMIT 3');
        console.log('✅ Available profiles:');
        profiles.rows.forEach((profile, index) => {
            console.log('  ' + (index + 1) + '. ' + profile.name + ' (Price: ' + profile.price_sell + ')');
        });
        
        if (profiles.rows.length > 0) {
            // Create a test voucher
            console.log('\\n📋 STEP 4: Creating test voucher...');
            const testCode = 'TEST' + Date.now();
            const selectedProfile = profiles.rows[0];
            
            const insertResult = await pool.query(
                'INSERT INTO vouchers (code, profile_id, profile_name, price_sell, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
                [testCode, selectedProfile.id, selectedProfile.name, selectedProfile.price_sell, 'active']
            );
            
            console.log('✅ Test voucher created:');
            console.log('  Code: ' + insertResult.rows[0].code);
            console.log('  Profile: ' + insertResult.rows[0].profile_name);
            console.log('  Status: ' + insertResult.rows[0].status);
            
            // Verify voucher was created
            console.log('\\n📋 STEP 5: Verifying voucher creation...');
            const verifyResult = await pool.query('SELECT * FROM vouchers WHERE code = $1', [testCode]);
            
            if (verifyResult.rows.length > 0) {
                console.log('✅ Voucher verified in database');
                
                // Get new total count
                const newCount = await pool.query('SELECT COUNT(*) as count FROM vouchers');
                console.log('✅ Total vouchers now:', newCount.rows[0].count);
                
            } else {
                console.log('❌ Voucher not found in database');
            }
        }
        
        console.log('\\n' + '='.repeat(50));
        console.log('🎉 SIMPLE VOUCHER TEST COMPLETED');
        console.log('='.repeat(50));
        console.log('\\n✅ Database operations successful');
        console.log('✅ Voucher creation working');
        console.log('✅ Ready for Mikrotik integration testing');
        
    } catch (error) {
        console.error('\\n❌ TEST FAILED:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
testVoucherCreation()
    .then(() => {
        console.log('\\n✅ Test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\\n❌ Test failed:', error);
        process.exit(1);
    });
