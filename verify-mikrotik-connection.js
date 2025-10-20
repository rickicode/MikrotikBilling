#!/usr/bin/env node

/**
 * Mikrotik Connection Verification Script
 * Verifies that we can connect to the Mikrotik RouterOS before running tests
 */

const { RouterOSClient } = require('mikro-routeros');

const MIKROTIK_CONFIG = {
  host: '54.37.252.142',
  port: 8728,
  username: 'userku',
  password: 'ganteng',
  timeout: 30000
};

console.log('🔌 Verifying Mikrotik RouterOS Connection...');
console.log('📍 Target:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
console.log('');

async function verifyConnection() {
  let client = null;
  
  try {
    console.log('🚀 Initializing connection...');
    client = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
    
    console.log('📡 Connecting to Mikrotik RouterOS...');
    await client.connect();
    
    console.log('🔐 Logging in...');
    await client.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
    
    console.log('✅ Successfully connected and authenticated!');
    
    // Test basic query
    console.log('📊 Testing basic query...');
    const identity = await client.runQuery('/system/identity/print');
    
    if (identity && identity.length > 0) {
      const identityName = identity[0].name || identity[0]['identity-name'] || identity[0].identity || 'Unknown';
      console.log('🏷️  RouterOS Identity:', identityName);
    }
    
    // Test hotspot user query
    console.log('👥 Testing hotspot user query...');
    const hotspotUsers = await client.runQuery('/ip/hotspot/user/print');
    console.log('📊 Total Hotspot Users:', hotspotUsers.length);
    
    // Count voucher users
    const voucherUsers = hotspotUsers.filter(user => 
      user.comment && user.comment.includes('VOUCHER_SYSTEM')
    );
    console.log('🎫 Current Voucher Users:', voucherUsers.length);
    
    if (voucherUsers.length > 0) {
      console.log('📋 Sample voucher users:');
      voucherUsers.slice(0, 3).forEach((user, index) => {
        console.log('  ' + (index + 1) + '. ' + user.name + ' (' + user.profile + ') - ' + user.comment);
      });
    }
    
    // Test hotspot profile query
    console.log('🔧 Testing hotspot profile query...');
    const hotspotProfiles = await client.runQuery('/ip/hotspot/user/profile/print');
    const voucherSystemProfiles = hotspotProfiles.filter(profile => 
      profile.comment && profile.comment.includes('VOUCHER_SYSTEM')
    );
    console.log('📋 Voucher System Profiles:', voucherSystemProfiles.length);
    
    if (voucherSystemProfiles.length > 0) {
      console.log('📋 Available profiles for vouchers:');
      voucherSystemProfiles.slice(0, 5).forEach((profile, index) => {
        console.log('  ' + (index + 1) + '. ' + profile.name + ' (' + profile['rate-limit'] + ')');
      });
    }
    
    console.log('');
    console.log('🎉 MIKROTIK CONNECTION VERIFICATION SUCCESSFUL!');
    console.log('✅ Ready to run comprehensive voucher generation tests');
    
    return true;
    
  } catch (error) {
    console.error('❌ MIKROTIK CONNECTION VERIFICATION FAILED!');
    console.error('🚨 Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.error('');
      console.error('🔧 Troubleshooting:');
      console.error('  - Check if Mikrotik RouterOS is accessible');
      console.error('  - Verify IP address and port:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
      console.error('  - Check network connectivity');
      console.error('  - Verify firewall settings');
    } else if (error.message.includes('login') || error.message.includes('authentication')) {
      console.error('');
      console.error('🔧 Troubleshooting:');
      console.error('  - Verify username:', MIKROTIK_CONFIG.username);
      console.error('  - Verify password');
      console.error('  - Check if API service is enabled on RouterOS');
    }
    
    return false;
    
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔌 Connection closed');
      } catch (error) {
        console.warn('Warning: Failed to close connection:', error.message);
      }
    }
  }
}

// Run verification
verifyConnection().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
