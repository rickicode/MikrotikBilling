const fetch = require('node-fetch');

// Test direct voucher creation via API
async function testDirectVoucherCreation() {
    console.log('🎯 TESTING DIRECT VOUCHER CREATION');
    console.log('='.repeat(50));
    
    try {
        // First, let's check if server is running
        console.log('\n📋 STEP 1: Checking server status...');
        const response = await fetch('http://localhost:3005/api/health');
        
        if (!response.ok) {
            throw new Error('Server not responding correctly');
        }
        
        console.log('✅ Server is running');
        
        // Check available profiles
        console.log('\n📋 STEP 2: Getting available profiles...');
        const profilesResponse = await fetch('http://localhost:3005/api/profiles');
        
        if (profilesResponse.ok) {
            const profiles = await profilesResponse.json();
            console.log('✅ Available profiles:', profiles.length);
            
            if (profiles.data && profiles.data.length > 0) {
                profiles.data.forEach((profile, index) => {
                    console.log(`  ${index + 1}. ${profile.name} (ID: ${profile.id})`);
                });
                
                // Try to create voucher with first profile
                console.log('\n📋 STEP 3: Creating test voucher...');
                
                const voucherData = {
                    profile_id: profiles.data[0].id,
                    quantity: 1,
                    prefix: 'TEST'
                };
                
                const createResponse = await fetch('http://localhost:3005/api/vouchers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(voucherData)
                });
                
                if (createResponse.ok) {
                    const result = await createResponse.json();
                    console.log('✅ Voucher created successfully!');
                    console.log('Result:', JSON.stringify(result, null, 2));
                    
                    // Check if vouchers were created
                    if (result.data && result.data.vouchers) {
                        console.log('\n🎫 Created vouchers:');
                        result.data.vouchers.forEach((voucher, index) => {
                            console.log(`  ${index + 1}. ${voucher.code} - ${voucher.profile_name}`);
                        });
                    }
                    
                } else {
                    const error = await createResponse.text();
                    console.log('❌ Voucher creation failed:', error);
                    
                    // Check if authentication is required
                    if (createResponse.status === 401) {
                        console.log('🔐 Authentication required');
                    }
                }
                
            } else {
                console.log('❌ No profiles available');
            }
        } else {
            console.log('❌ Failed to get profiles:', profilesResponse.status);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Alternative test - simulate form submission
async function testFormSubmission() {
    console.log('\n🎯 TESTING FORM SUBMISSION');
    console.log('='.repeat(50));
    
    try {
        // Try to access voucher creation page
        const pageResponse = await fetch('http://localhost:3005/vouchers/create');
        
        if (pageResponse.ok) {
            const pageContent = await pageResponse.text();
            
            // Look for CSRF token or form elements
            const csrfMatch = pageContent.match(/name=[\"']_csrf[\"'] value=[\"']([^\"']+)[\"']/);
            const profileMatch = pageContent.match(/<select[^>]*name=[\"']profile[\"'][^>]*>(.*?)<\/select>/s);
            
            console.log('✅ Voucher creation page accessible');
            console.log('CSRF token found:', !!csrfMatch);
            console.log('Profile dropdown found:', !!profileMatch);
            
            if (csrfMatch) {
                console.log('CSRF Token:', csrfMatch[1]);
            }
        } else {
            console.log('❌ Cannot access voucher creation page:', pageResponse.status);
        }
        
    } catch (error) {
        console.error('❌ Form test failed:', error.message);
    }
}

// Run both tests
async function runAllTests() {
    await testDirectVoucherCreation();
    await testFormSubmission();
    
    console.log('\n🎯 TEST COMPLETED');
    console.log('Next steps:');
    console.log('1. If authentication required, implement proper login');
    console.log('2. If API works, use API for voucher creation');
    console.log('3. If form accessible, implement form submission');
}

runAllTests();
