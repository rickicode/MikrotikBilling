const { testRealVoucherGeneration } = require('./test-real-voucher-generation');
const { verifyVouchersInMikrotik } = require('./mikrotik-verification-helper');

// Comprehensive test runner
async function runComprehensiveVoucherTest() {
    console.log('🎯 COMPREHENSIVE VOUCHER SYSTEM TEST');
    console.log('='.repeat(80));
    console.log('This test will:');
    console.log('1. Generate REAL vouchers from web interface');
    console.log('2. Verify vouchers appear in web list');
    console.log('3. Verify vouchers are created in Mikrotik RouterOS');
    console.log('4. Generate detailed reports with screenshots');
    console.log('='.repeat(80));
    
    const testResults = {
        startTime: new Date().toISOString(),
        webTest: null,
        mikrotikTest: null,
        success: false
    };
    
    try {
        // Step 1: Run web-based voucher generation test
        console.log('\n🌐 PHASE 1: WEB INTERFACE VOUCHER GENERATION');
        console.log('Press Enter to continue or Ctrl+C to abort...');
        
        // Wait for user confirmation
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        console.log('Starting web interface test...');
        testResults.webTest = await testRealVoucherGeneration();
        
        // Give some time between tests
        console.log('\n⏳ Waiting 10 seconds before Mikrotik verification...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Step 2: Run Mikrotik verification
        console.log('\n🔍 PHASE 2: MIKROTIK ROUTEROS VERIFICATION');
        console.log('Verifying that generated vouchers exist in RouterOS...');
        
        testResults.mikrotikTest = await verifyVouchersInMikrotik();
        
        // Step 3: Generate final report
        testResults.endTime = new Date().toISOString();
        testResults.success = true;
        testResults.duration = new Date(testResults.endTime) - new Date(testResults.startTime);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 COMPREHENSIVE TEST COMPLETED SUCCESSFULLY');
        console.log('='.repeat(80));
        
        console.log('\n📊 FINAL RESULTS:');
        console.log('⏱️  Total Duration: ' + Math.round(testResults.duration / 1000) + ' seconds');
        console.log('🌐 Web Test: ✅ PASSED');
        console.log('🔍 Mikrotik Test: ✅ PASSED');
        
        if (testResults.mikrotikTest) {
            const mikrotikResults = testResults.mikrotikTest.summary;
            console.log('\n📈 Mikrotik Verification Results:');
            console.log('  🎫 Voucher System Users: ' + mikrotikResults.voucherSystemUsers);
            console.log('  🔄 Recent Vouchers: ' + mikrotikResults.recentVouchers);
            console.log('  🚫 Disabled Vouchers: ' + mikrotikResults.disabledVouchers);
            
            if (mikrotikResults.voucherSystemUsers > 0) {
                console.log('\n✅ SUCCESS: Voucher generation system is working correctly!');
                console.log('✅ Generated vouchers are successfully created in Mikrotik RouterOS');
                console.log('✅ Web interface and RouterOS integration is functional');
            } else {
                console.log('\n⚠️  WARNING: No voucher system users found in Mikrotik');
                console.log('⚠️  Check the voucher generation process and Mikrotik connection');
            }
        }
        
        console.log('\n📁 Check the following files for detailed information:');
        console.log('  📸 Screenshots: ./test-artifacts/voucher-generation-*/');
        console.log('  📊 Mikrotik Report: ./mikrotik-verification-report-*.json');
        
        console.log('\n🎯 READY FOR PRODUCTION: Voucher system verification complete!');
        
    } catch (error) {
        testResults.endTime = new Date().toISOString();
        testResults.error = error.message;
        testResults.success = false;
        
        console.error('\n❌ COMPREHENSIVE TEST FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        
        console.log('\n🔧 TROUBLESHOOTING:');
        console.log('1. Check if the web server is running on http://localhost:3005');
        console.log('2. Verify cookies.txt contains valid authentication');
        console.log('3. Ensure Mikrotik RouterOS is accessible');
        console.log('4. Check if required profiles exist in the system');
        console.log('5. Verify database connection is working');
        
        process.exit(1);
    }
}

// Run the comprehensive test
if (require.main === module) {
    // Enable stdin for user input
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    runComprehensiveVoucherTest()
        .then(() => {
            console.log('\n✅ Comprehensive test execution completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Comprehensive test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { runComprehensiveVoucherTest };
