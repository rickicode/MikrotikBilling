#!/usr/bin/env node

const { spawn } = require('child_process');
const { resetDatabase } = require('./reset-database');

/**
 * Simple Test Runner
 * For debugging and quick testing without full server management
 */

async function runSimpleTest() {
  console.log('🎯 Running Simple Mikrotik Billing Test');
  console.log('=====================================');

  try {
    // Reset database first
    console.log('🔄 Resetting database...');
    await resetDatabase();
    console.log('✅ Database reset completed');

    // Run the test
    console.log('🧪 Running tests...');
    
    const testProcess = spawn('npx', [
      'playwright', 
      'test', 
      'tests/mikrotik-billing-comprehensive.spec.js',
      '--headed',
      '--timeout=600000'
    ], {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        TEST_BASE_URL: 'http://localhost:3000',
        HEADLESS: 'false'
      }
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n🎉 Tests completed successfully!');
      } else {
        console.log(`\n❌ Tests failed with code: ${code}`);
      }
      process.exit(code);
    });

    testProcess.on('error', (error) => {
      console.error('❌ Failed to run tests:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Test setup failed:', error);
    process.exit(1);
  }
}

runSimpleTest();
