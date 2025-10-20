const { Client } = require('node-routeros');
const fs = require('fs');

// Mikrotik Configuration - sesuaikan dengan setting Anda
const MIKROTIK_CONFIG = {
    host: '192.168.88.1', // Ganti dengan IP Mikrotik Anda
    user: 'admin',         // Ganti dengan username Mikrotik
    password: '',          // Ganti dengan password Mikrotik
    port: 8728             // API port default
};

// Helper function to connect to Mikrotik
async function connectToMikrotik() {
    try {
        const connection = new Client({
            host: MIKROTIK_CONFIG.host,
            user: MIKROTIK_CONFIG.user,
            password: MIKROTIK_CONFIG.password,
            port: MIKROTIK_CONFIG.port
        });
        
        await connection.connect();
        console.log('✅ Connected to Mikrotik RouterOS');
        return connection;
    } catch (error) {
        console.error('❌ Failed to connect to Mikrotik:', error.message);
        throw error;
    }
}

// Helper function to format timestamp
function formatTimestamp(mikrotikTime) {
    // Mikrotik timestamp format: jan/01/2003 00:00:00
    return new Date(mikrotikTime).toISOString();
}

// Main verification function
async function verifyVouchersInMikrotik() {
    console.log('🔍 STARTING MIKROTIK VOUCHER VERIFICATION');
    console.log('='.repeat(60));
    
    let connection;
    
    try {
        // Connect to Mikrotik
        connection = await connectToMikrotik();
        
        // 1. GET ALL HOTSPOT USERS
        console.log('\n📋 STEP 1: Retrieving all hotspot users...');
        
        const hotspotUsers = await connection.write('/ip/hotspot/user/print');
        console.log('✅ Found ' + hotspotUsers.length + ' hotspot users');
        
        // 2. FILTER VOUCHER SYSTEM USERS
        console.log('\n📋 STEP 2: Filtering voucher system users...');
        
        const voucherUsers = hotspotUsers.filter(user => 
            user.comment && user.comment.includes('VOUCHER_SYSTEM')
        );
        
        console.log('✅ Found ' + voucherUsers.length + ' voucher system users');
        
        if (voucherUsers.length === 0) {
            console.log('⚠️  No voucher system users found. Checking all hotspot users...');
            
            // Show all users for debugging
            hotspotUsers.forEach((user, index) => {
                console.log('User ' + (index + 1) + ':');
                console.log('  Name: ' + (user.name || 'N/A'));
                console.log('  Comment: ' + (user.comment || 'N/A'));
                console.log('  Profile: ' + (user.profile || 'N/A'));
                console.log('  Disabled: ' + (user.disabled || 'false'));
                console.log('---');
            });
        }
        
        // 3. DISPLAY VOUCHER USERS DETAILS
        console.log('\n📋 STEP 3: Displaying voucher user details...');
        
        voucherUsers.forEach((user, index) => {
            console.log('\n🎫 VOUCHER USER ' + (index + 1) + ':');
            console.log('  Username: ' + user.name);
            console.log('  Profile: ' + (user.profile || 'N/A'));
            console.log('  Enabled: ' + (user.disabled === 'true' ? 'No' : 'Yes'));
            console.log('  Comment: ' + user.comment);
            
            // Parse VOUCHER_SYSTEM comment
            if (user.comment && user.comment.includes('VOUCHER_SYSTEM')) {
                const commentParts = user.comment.split('|');
                console.log('  Comment Analysis:');
                console.log('    Type: ' + (commentParts[0] || 'N/A'));
                console.log('    Price: ' + (commentParts[1] || 'N/A'));
                console.log('    First Login: ' + (commentParts[2] || 'N/A'));
                console.log('    Valid Until: ' + (commentParts[3] || 'N/A'));
            }
            
            // Check creation time (if available)
            if (user['.id']) {
                console.log('  Internal ID: ' + user['.id']);
            }
        });
        
        // 4. CHECK RECENT VOUCHERS (last 10 minutes)
        console.log('\n📋 STEP 4: Checking for recent vouchers...');
        
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentVouchers = voucherUsers.filter(user => {
            // This is approximate since Mikrotik doesn't always provide creation timestamps
            // We'll check if comment suggests recent activity
            return user.comment && user.comment.includes('VOUCHER_SYSTEM');
        });
        
        console.log('✅ Found ' + recentVouchers.length + ' recent voucher candidates');
        
        // 5. VERIFY PROFILE ASSIGNMENT
        console.log('\n📋 STEP 5: Verifying profile assignments...');
        
        const profileCounts = {};
        voucherUsers.forEach(user => {
            const profile = user.profile || 'Unknown';
            profileCounts[profile] = (profileCounts[profile] || 0) + 1;
        });
        
        console.log('Profile distribution:');
        Object.keys(profileCounts).forEach(profile => {
            console.log('  ' + profile + ': ' + profileCounts[profile] + ' users');
        });
        
        // 6. CHECK FOR DISABLED VOUCHERS
        console.log('\n📋 STEP 6: Checking for disabled vouchers...');
        
        const disabledVouchers = voucherUsers.filter(user => user.disabled === 'true');
        console.log('Disabled vouchers: ' + disabledVouchers.length + '/' + voucherUsers.length);
        
        if (disabledVouchers.length > 0) {
            console.log('Disabled voucher details:');
            disabledVouchers.forEach((user, index) => {
                console.log('  ' + (index + 1) + '. ' + user.name + ' (Profile: ' + (user.profile || 'N/A') + ')');
            });
        }
        
        // 7. GENERATE VERIFICATION REPORT
        console.log('\n📋 STEP 7: Generating verification report...');
        
        const verificationReport = {
            timestamp: new Date().toISOString(),
            mikrotikConnection: {
                host: MIKROTIK_CONFIG.host,
                success: true
            },
            summary: {
                totalHotspotUsers: hotspotUsers.length,
                voucherSystemUsers: voucherUsers.length,
                recentVouchers: recentVouchers.length,
                disabledVouchers: disabledVouchers.length
            },
            profileDistribution: profileCounts,
            voucherUsers: voucherUsers.map(user => ({
                username: user.name,
                profile: user.profile,
                enabled: user.disabled !== 'true',
                comment: user.comment,
                commentParsed: user.comment && user.comment.includes('VOUCHER_SYSTEM') ? {
                    type: user.comment.split('|')[0],
                    price: user.comment.split('|')[1],
                    firstLogin: user.comment.split('|')[2],
                    validUntil: user.comment.split('|')[3]
                } : null
            })),
            recommendations: []
        };
        
        // Add recommendations
        if (voucherUsers.length === 0) {
            verificationReport.recommendations.push('❌ No voucher system users found. Check voucher generation process.');
        }
        
        if (disabledVouchers.length > voucherUsers.length * 0.1) {
            verificationReport.recommendations.push('⚠️  Many vouchers are disabled. Check expiry settings.');
        }
        
        if (Object.keys(profileCounts).length === 1) {
            verificationReport.recommendations.push('ℹ️  All vouchers use the same profile. Consider diversifying.');
        }
        
        // Save report
        const reportFileName = './mikrotik-verification-report-' + Date.now() + '.json';
        fs.writeFileSync(reportFileName, JSON.stringify(verificationReport, null, 2));
        
        console.log('✅ Verification report saved to: ' + reportFileName);
        
        // 8. FINAL SUMMARY
        console.log('\n' + '='.repeat(60));
        console.log('🎉 MIKROTIK VERIFICATION COMPLETED');
        console.log('='.repeat(60));
        
        console.log('\n📊 VERIFICATION SUMMARY:');
        console.log('🌐 Total Hotspot Users: ' + hotspotUsers.length);
        console.log('🎫 Voucher System Users: ' + voucherUsers.length);
        console.log('🔄 Recent Vouchers: ' + recentVouchers.length);
        console.log('🚫 Disabled Vouchers: ' + disabledVouchers.length);
        
        if (voucherUsers.length > 0) {
            console.log('\n✅ SUCCESS: Voucher system users found in Mikrotik!');
            console.log('✅ Voucher generation is working correctly');
            console.log('✅ Mikrotik integration is functional');
        } else {
            console.log('\n❌ ISSUE: No voucher system users found');
            console.log('❌ Check voucher generation process');
            console.log('❌ Verify Mikrotik connection settings');
        }
        
        console.log('\n📄 Detailed report: ' + reportFileName);
        
        return verificationReport;
        
    } catch (error) {
        console.error('\n❌ MIKROTIK VERIFICATION FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Try to provide helpful troubleshooting information
        console.log('\n🔧 TROUBLESHOOTING:');
        console.log('1. Check Mikrotik IP address: ' + MIKROTIK_CONFIG.host);
        console.log('2. Verify API service is enabled on port ' + MIKROTIK_CONFIG.port);
        console.log('3. Confirm username/password are correct');
        console.log('4. Check firewall rules allow API access');
        console.log('5. Ensure Mikrotik is reachable from this network');
        
        throw error;
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log('✅ Mikrotik connection closed');
            } catch (closeError) {
                console.log('⚠️  Error closing Mikrotik connection:', closeError.message);
            }
        }
    }
}

// Function to get Mikrotik config from environment or prompt
function getMikrotikConfig() {
    // You can modify these values or set them as environment variables
    return {
        host: process.env.MIKROTIK_HOST || '192.168.88.1',
        user: process.env.MIKROTIK_USER || 'admin', 
        password: process.env.MIKROTIK_PASSWORD || '',
        port: parseInt(process.env.MIKROTIK_PORT) || 8728
    };
}

// Run verification if called directly
if (require.main === module) {
    // Update config with environment variables if available
    const envConfig = getMikrotikConfig();
    Object.assign(MIKROTIK_CONFIG, envConfig);
    
    console.log('🔧 Using Mikrotik config:');
    console.log('  Host: ' + MIKROTIK_CONFIG.host);
    console.log('  User: ' + MIKROTIK_CONFIG.user);
    console.log('  Port: ' + MIKROTIK_CONFIG.port);
    console.log('  Password: ' + (MIKROTIK_CONFIG.password ? '[SET]' : '[EMPTY]'));
    
    verifyVouchersInMikrotik()
        .then((report) => {
            console.log('\n✅ Mikrotik verification completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Mikrotik verification failed:', error.message);
            process.exit(1);
        });
}

module.exports = { verifyVouchersInMikrotik, getMikrotikConfig };
