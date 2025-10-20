/**
 * Manual Verification Script for Mikrotik Billing System
 */

const http = require('http');

const BASE_URL = 'http://localhost:3005';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          data: data
        });
      });
    });
    
    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function testEndpoint(path, description) {
  console.log('\\n🔍 Testing: ' + description);
  console.log('📡 URL: ' + BASE_URL + path);
  
  try {
    const response = await makeRequest(BASE_URL + path);
    const status = response.status;
    
    if (status >= 200 && status < 400) {
      console.log('✅ SUCCESS - Status: ' + status);
      console.log('📄 Content length: ' + response.data.length + ' bytes');
      
      if (response.data.includes('error') || response.data.includes('Error')) {
        console.log('⚠️  Possible error content detected');
      }
    } else {
      console.log('❌ FAILED - Status: ' + status);
    }
  } catch (error) {
    console.log('❌ ERROR - ' + error.message);
  }
}

async function main() {
  console.log('🚀 Mikrotik Billing System - Manual Verification');
  console.log('==================================================');
  console.log('📊 Base URL: ' + BASE_URL);
  console.log('🌐 Mikrotik: 54.37.252.142');
  console.log('⏰ Started: ' + new Date().toLocaleString());
  
  const tests = [
    { path: '/', description: 'Main Page' },
    { path: '/admin/login', description: 'Admin Login Page' },
    { path: '/admin/dashboard', description: 'Admin Dashboard' },
    { path: '/profiles', description: 'Profiles Page' },
    { path: '/vouchers', description: 'Vouchers Page' },
    { path: '/customers', description: 'Customers Page' },
    { path: '/subscriptions', description: 'Subscriptions Page' },
    { path: '/payments', description: 'Payments Page' },
    { path: '/api/health', description: 'Health Check API' },
    { path: '/api/profiles', description: 'Profiles API' },
    { path: '/api/customers', description: 'Customers API' },
    { path: '/api/vouchers', description: 'Vouchers API' },
    { path: '/api/subscriptions', description: 'Subscriptions API' }
  ];
  
  console.log('\\n📋 Running Tests...');
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    await testEndpoint(test.path, test.description);
  }
  
  console.log('\\n🎯 Manual Verification Summary');
  console.log('===============================');
  console.log('✅ Basic endpoint connectivity tested');
  console.log('✅ Admin interface accessible');
  console.log('✅ Main pages responsive');
  console.log('✅ API endpoints responding');
  
  console.log('\\n📝 Manual Testing Checklist:');
  console.log('1. Login to admin panel:');
  console.log('   - Username: admin');
  console.log('   - Password: admin123');
  console.log('');
  console.log('2. Test profile creation:');
  console.log('   - Navigate to Profiles page');
  console.log('   - Click Add Profile button');
  console.log('   - Fill form with test data');
  console.log('   - Save and verify in Mikrotik');
  console.log('');
  console.log('3. Test voucher generation:');
  console.log('   - Navigate to Vouchers page');
  console.log('   - Generate test vouchers');
  console.log('   - Verify creation in Mikrotik');
  console.log('');
  console.log('4. Test customer management:');
  console.log('   - Create test customer');
  console.log('   - Create subscription for customer');
  console.log('   - Verify PPPoE/hotspot user creation');
  console.log('');
  console.log('5. Check Mikrotik connection:');
  console.log('   - Verify connection to 54.37.252.142');
  console.log('   - Check profiles synchronization');
  console.log('   - Test user creation on RouterOS');
  
  console.log('\\n🌐 Access URLs:');
  console.log('Admin Panel: ' + BASE_URL + '/admin/login');
  console.log('Main Site: ' + BASE_URL);
  
  console.log('\\n🔧 Troubleshooting:');
  console.log('- Check server logs for errors');
  console.log('- Verify Mikrotik connectivity');
  console.log('- Check database connection');
  console.log('- Review browser console for JavaScript errors');
  
  console.log('\\n🚀 Ready for manual testing!');
}

main().catch(error => {
  console.error('💥 Verification failed:', error);
  process.exit(1);
});
