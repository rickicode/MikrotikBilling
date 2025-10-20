#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resetDatabase } = require('./reset-database');

/**
 * Comprehensive Test Runner
 * Runs the complete Mikrotik Billing test suite
 */

const TEST_CONFIG = {
  baseURL: 'http://localhost:3000',
  mikrotikHost: '54.37.252.142',
  mikrotikUser: 'admin',
  mikrotikPassword: 'ganteng',
  headless: process.env.HEADLESS === 'true',
  timeout: 600000 // 10 minutes
};

async function ensureTestDirectories() {
  const directories = [
    'test-artifacts',
    'test-artifacts/screenshots',
    'test-artifacts/logs',
    'test-artifacts/videos'
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  }
}

async function checkServerStatus() {
  console.log('🔍 Checking server status...');
  
  return new Promise((resolve, reject) => {
    const http = require('http');
    
    const req = http.get('http://localhost:3000', (res) => {
      console.log('✅ Server is running');
      resolve(true);
    });
    
    req.on('error', () => {
      console.log('❌ Server is not running, starting it...');
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      console.log('❌ Server check timeout');
      resolve(false);
    });
  });
}

async function startServer() {
  console.log('🚀 Starting application server...');
  
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('npm', ['start'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    let serverStarted = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('📋 Server:', output.trim());
      
      if (output.includes('Server running') || output.includes('listening')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log('✅ Server started successfully');
          setTimeout(() => resolve(serverProcess), 3000);
        }
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.log('❌ Server Error:', data.toString().trim());
    });
    
    serverProcess.on('error', (error) => {
      console.error('❌ Failed to start server:', error);
      reject(error);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverStarted) {
        console.log('⚠️ Server startup timeout, assuming it is running');
        resolve(serverProcess);
      }
    }, 30000);
  });
}

async function runTests() {
  console.log('🧪 Starting comprehensive test suite...');
  
  return new Promise((resolve, reject) => {
    const testProcess = spawn('npx', ['playwright', 'test', 'tests/mikrotik-billing-comprehensive.spec.js'], {
      stdio: 'inherit',
      env: { 
        ...process.env, 
        TEST_BASE_URL: TEST_CONFIG.baseURL,
        HEADLESS: TEST_CONFIG.headless ? 'true' : 'false'
      }
    });
    
    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ All tests completed successfully');
        resolve(code);
      } else {
        console.log(`❌ Tests failed with code: ${code}`);
        reject(new Error(`Test process exited with code ${code}`));
      }
    });
    
    testProcess.on('error', (error) => {
      console.error('❌ Failed to run tests:', error);
      reject(error);
    });
  });
}

async function generateReport() {
  console.log('📊 Generating test report...');
  
  const reportData = {
    timestamp: new Date().toISOString(),
    testSuite: 'Mikrotik Billing Comprehensive Test',
    configuration: TEST_CONFIG,
    artifacts: {
      screenshots: 'test-artifacts/screenshots',
      logs: 'test-artifacts/logs',
      videos: 'test-artifacts/videos'
    }
  };
  
  const reportPath = path.join('test-artifacts', `comprehensive-test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  
  console.log(`📄 Test report generated: ${reportPath}`);
}

async function main() {
  console.log('🎯 Starting Mikrotik Billing Comprehensive Test Suite');
  console.log('=' .repeat(60));
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  console.log(`🌐 Base URL: ${TEST_CONFIG.baseURL}`);
  console.log(`🔧 Headless: ${TEST_CONFIG.headless}`);
  console.log(`⏰ Timeout: ${TEST_CONFIG.timeout}ms`);
  console.log('=' .repeat(60));

  let serverProcess = null;
  
  try {
    // Step 1: Ensure test directories
    await ensureTestDirectories();
    
    // Step 2: Check server status
    const serverRunning = await checkServerStatus();
    
    if (!serverRunning) {
      // Step 3: Start server if not running
      serverProcess = await startServer();
    }
    
    // Step 4: Reset database
    console.log('\n🔄 Resetting database to clean state...');
    await resetDatabase();
    
    // Step 5: Run tests
    console.log('\n🧪 Running comprehensive test suite...');
    await runTests();
    
    // Step 6: Generate report
    await generateReport();
    
    console.log('\n🎉 Comprehensive test suite completed successfully!');
    console.log('📊 Check test-artifacts/ directory for screenshots and reports');
    
  } catch (error) {
    console.error('\n❌ Comprehensive test suite failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up server process if we started it
    if (serverProcess) {
      console.log('\n🔄 Cleaning up server process...');
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      setTimeout(() => {
        serverProcess.kill('SIGKILL');
      }, 5000);
    }
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n⚠️ Test suite interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ Test suite terminated');
  process.exit(1);
});

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
