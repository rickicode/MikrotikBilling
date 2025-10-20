const MikrotikClient = require('./src/services/MikrotikClient');

async function testMikrotikIntegration() {
  console.log('Testing Mikrotik RouterOS Integration...');
  
  try {
    // Create Mikrotik client instance
    const mikrotikClient = new MikrotikClient();
    
    console.log('Connecting to Mikrotik RouterOS...');
    await mikrotikClient.connect();
    
    console.log('✓ Connected to Mikrotik RouterOS');
    
    // Test hotspot users
    try {
      console.log('Checking hotspot users...');
      const hotspotUsers = await mikrotikClient.getHotspotUsers();
      console.log('✓ Found ' + hotspotUsers.length + ' hotspot users');
      
      // Look for test users created during testing
      const testUsers = hotspotUsers.filter(user => 
        user.comment && (
          user.comment.includes('TEST') || 
          user.comment.includes('test') ||
          user.comment.includes('1760982682228')
        )
      );
      
      if (testUsers.length > 0) {
        console.log('✓ Found test hotspot users:');
        testUsers.forEach(user => {
          console.log('  - User: ' + user.name + ', Comment: ' + user.comment);
        });
      } else {
        console.log('⚠ No test hotspot users found');
        console.log('Sample hotspot users:');
        hotspotUsers.slice(0, 3).forEach(user => {
          console.log('  - User: ' + user.name + ', Comment: ' + (user.comment || 'None'));
        });
      }
    } catch (error) {
      console.log('✗ Error checking hotspot users:', error.message);
    }
    
    // Test PPPoE secrets
    try {
      console.log('Checking PPPoE secrets...');
      const pppoeSecrets = await mikrotikClient.getPPPoESecrets();
      console.log('✓ Found ' + pppoeSecrets.length + ' PPPoE secrets');
      
      // Look for test PPPoE users created during testing
      const testPPPoE = pppoeSecrets.filter(secret => 
        secret.name && (
          secret.name.includes('testpppoe') || 
          secret.name.includes('1760982682228')
        )
      );
      
      if (testPPPoE.length > 0) {
        console.log('✓ Found test PPPoE users:');
        testPPPoE.forEach(secret => {
          var comment = secret.comment || 'None';
          console.log('  - User: ' + secret.name + ', Service: ' + secret.service + ', Comment: ' + comment);
        });
      } else {
        console.log('⚠ No test PPPoE users found');
        console.log('Sample PPPoE secrets:');
        pppoeSecrets.slice(0, 3).forEach(secret => {
          console.log('  - User: ' + secret.name + ', Service: ' + secret.service);
        });
      }
    } catch (error) {
      console.log('✗ Error checking PPPoE secrets:', error.message);
    }
    
    // Test profiles
    try {
      console.log('Checking hotspot profiles...');
      const hotspotProfiles = await mikrotikClient.getHotspotProfiles();
      console.log('✓ Found ' + hotspotProfiles.length + ' hotspot profiles');
      
      const voucherProfiles = hotspotProfiles.filter(profile => 
        profile.comment && profile.comment.includes('VOUCHER_SYSTEM')
      );
      
      console.log('✓ Found ' + voucherProfiles.length + ' voucher system profiles');
      
      voucherProfiles.slice(0, 3).forEach(profile => {
        console.log('  - Profile: ' + profile.name + ', Comment: ' + profile.comment);
      });
      
    } catch (error) {
      console.log('✗ Error checking hotspot profiles:', error.message);
    }
    
    try {
      console.log('Checking PPPoE profiles...');
      const pppoeProfiles = await mikrotikClient.getPPPoEProfiles();
      console.log('✓ Found ' + pppoeProfiles.length + ' PPPoE profiles');
      
      const pppoeSystemProfiles = pppoeProfiles.filter(profile => 
        profile.comment && profile.comment.includes('PPPOE_SYSTEM')
      );
      
      console.log('✓ Found ' + pppoeSystemProfiles.length + ' PPPoE system profiles');
      
      pppoeSystemProfiles.slice(0, 3).forEach(profile => {
        console.log('  - Profile: ' + profile.name + ', Comment: ' + profile.comment);
      });
      
    } catch (error) {
      console.log('✗ Error checking PPPoE profiles:', error.message);
    }
    
    // Test connection status
    try {
      console.log('Checking connection status...');
      const status = mikrotikClient.getConnectionStatus();
      console.log('✓ Connection status:', {
        connected: status.connected,
        lastConnectionTime: status.lastConnectionTime,
        isOffline: status.isOffline,
        reconnectAttempts: status.reconnectAttempts
      });
    } catch (error) {
      console.log('✗ Error checking connection status:', error.message);
    }
    
    await mikrotikClient.disconnect();
    console.log('✓ Mikrotik connection closed');
    
  } catch (error) {
    console.error('✗ Mikrotik connection failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('⚠ Mikrotik router is not accessible on the specified host/port');
      console.log('  Please check:');
      console.log('  - Router IP address');
      console.log('  - API service is enabled');
      console.log('  - Firewall allows API connections');
      console.log('  - Network connectivity');
    } else if (error.message.includes('timeout')) {
      console.log('⚠ Connection timeout - router may be busy or unreachable');
    } else if (error.message.includes('authentication')) {
      console.log('⚠ Authentication failed - check username/password');
    }
  }
}

// Run the test
testMikrotikIntegration().catch(console.error);
