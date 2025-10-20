#!/usr/bin/env node

// Test voucher API endpoints
const http = require('http');
const https = require('https');

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function testVoucherAPI() {
    console.log('🎫 Testing Voucher API Endpoints...');
    console.log('='.repeat(50));

    try {
        // Test 1: Check server health
        console.log('\n🎯 Test 1: Checking server availability...');
        try {
            const healthResponse = await makeRequest('http://localhost:3005/health');
            console.log('Health check status:', healthResponse.statusCode);
            if (healthResponse.statusCode === 200) {
                console.log('✅ Server is healthy');
            } else {
                console.log('⚠️ Server returned:', healthResponse.statusCode);
            }
        } catch (error) {
            console.log('❌ Server health check failed:', error.message);
        }

        // Test 2: Check dashboard availability
        console.log('\n🎯 Test 2: Checking dashboard...');
        try {
            const dashboardResponse = await makeRequest('http://localhost:3005/dashboard');
            console.log('Dashboard status:', dashboardResponse.statusCode);
            if (dashboardResponse.statusCode === 200 || dashboardResponse.statusCode === 302) {
                console.log('✅ Dashboard is accessible');
            } else {
                console.log('⚠️ Dashboard returned:', dashboardResponse.statusCode);
            }
        } catch (error) {
            console.log('❌ Dashboard check failed:', error.message);
        }

        // Test 3: Find API endpoints
        console.log('\n🎯 Test 3: Exploring API endpoints...');

        const endpoints = [
            '/api/vouchers',
            '/vouchers',
            '/api/vouchers/generate',
            '/vouchers/generate',
            '/api/profiles',
            '/profiles',
            '/api/mikrotik/status',
            '/mikrotik/status'
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await makeRequest(`http://localhost:3005${endpoint}`);
                if (response.statusCode !== 404) {
                    console.log(`✅ Found endpoint: ${endpoint} (${response.statusCode})`);

                    // If it's JSON, show a preview
                    if (response.headers['content-type'] && response.headers['content-type'].includes('json')) {
                        try {
                            const data = JSON.parse(response.body);
                            console.log(`   Preview:`, JSON.stringify(data).substring(0, 200) + '...');
                        } catch (e) {
                            console.log(`   Response: ${response.body.substring(0, 100)}...`);
                        }
                    }
                } else {
                    console.log(`❌ Not found: ${endpoint}`);
                }
            } catch (error) {
                console.log(`❌ Error testing ${endpoint}:`, error.message);
            }
        }

        // Test 4: Test voucher generation (if endpoint found)
        console.log('\n🎯 Test 4: Testing voucher creation...');

        // Try to create a voucher via POST
        const voucherData = {
            prefix: 'TEST',
            quantity: 1,
            profile_id: 1,
            price_sell: 5000,
            duration_hours: 24,
            expired_hours: 72
        };

        try {
            const createResponse = await makeRequest('http://localhost:3005/api/vouchers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(voucherData)
            });

            console.log('Voucher creation status:', createResponse.statusCode);
            if (createResponse.statusCode === 200 || createResponse.statusCode === 201) {
                console.log('✅ Voucher creation successful');
                console.log('Response:', createResponse.body);
            } else {
                console.log('❌ Voucher creation failed');
                console.log('Response:', createResponse.body);
            }
        } catch (error) {
            console.log('❌ Voucher creation error:', error.message);
        }

        // Test 5: Check RouterOS connection status
        console.log('\n🎯 Test 5: Checking RouterOS connection...');

        // Look for Mikrotik status endpoint
        try {
            const statusResponse = await makeRequest('http://localhost:3005/mikrotik/status');
            console.log('Mikrotik status:', statusResponse.statusCode);
            if (statusResponse.statusCode !== 404) {
                console.log('Response:', statusResponse.body);
            }
        } catch (error) {
            console.log('❌ Mikrotik status check failed:', error.message);
        }

        console.log('\n🎉 API testing completed!');

    } catch (error) {
        console.error('❌ API test failed:', error.message);
    }
}

testVoucherAPI();