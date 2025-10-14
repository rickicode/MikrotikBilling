async function globalTeardown(config) {
  console.log('🧹 Cleaning up test environment...');

  // Close any remaining database connections
  // Clean up test data if needed
  console.log('✅ Test environment cleaned up!');
}

module.exports = globalTeardown;