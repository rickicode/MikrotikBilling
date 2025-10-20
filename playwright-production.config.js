const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*production-comprehensive-test.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for production testing - we want to see all failures
  workers: 1, // Single worker to avoid race conditions
  reporter: [
    ['list'],
    ['html', { 
      outputFolder: 'playwright-report',
      open: 'never' 
    }],
    ['json', { 
      outputFile: 'test-results/production-test-results.json' 
    }],
    ['junit', { 
      outputFile: 'test-results/production-test-results.xml' 
    }]
  ],
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'retain-on-failure', // Keep traces on failure for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false, // Show browser for production testing
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    timeout: 60000, // Longer timeout for production operations
    actionTimeout: 20000 // Longer action timeout
  },
  projects: [
    {
      name: 'production-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Production-specific settings
        locale: 'en-US',
        timezoneId: 'Asia/Jakarta',
        // Slow down for debugging
        launchOptions: {
          slowMo: 100 // Slow down actions by 100ms for better visibility
        }
      },
    }
  ],
  expect: {
    timeout: 10000 // Longer expectation timeout
  },
  // Global setup and teardown
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  // Output configuration
  outputDir: 'test-results/',
});
