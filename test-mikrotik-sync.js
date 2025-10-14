const { RouterOSClient } = require('mikro-routeros');

async function testMikrotikSync() {
  const client = new RouterOSClient('54.37.252.142', 8728, 5000);

  try {
    console.log('Connecting to Mikrotik...');
    await client.connect();
    await client.login('userku', 'ganteng');
    console.log('✅ Connected to Mikrotik successfully');

    // Check if profile already exists
    console.log('Checking existing hotspot profiles...');
    const existingProfiles = await client.runQuery('/ip/hotspot/user/profile/print');
    console.log('Existing profiles:', existingProfiles.map(p => p.name));

    // Create hotspot profile
    console.log('Creating hotspot profile: Test-Profile-1Mbps');
    await client.runQuery('/ip/hotspot/user/profile/add', {
      name: 'Test-Profile-1Mbps',
      'shared-users': '1',
      'rate-limit': '1M/1M'
    });
    console.log('✅ Profile created in Mikrotik');

    // Verify profile was created
    console.log('Verifying profile creation...');
    const updatedProfiles = await client.runQuery('/ip/hotspot/user/profile/print');
    const testProfile = updatedProfiles.find(p => p.name === 'Test-Profile-1Mbps');

    if (testProfile) {
      console.log('✅ Profile found in Mikrotik:', testProfile);
    } else {
      console.log('❌ Profile not found in Mikrotik');
    }

    await client.close();
    console.log('✅ Disconnected from Mikrotik');

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      await client.close();
    } catch (closeError) {
      // Ignore
    }
  }
}

testMikrotikSync();