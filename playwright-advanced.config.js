const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*production-advanced-test.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { 
      outputFolder: 'playwright-report',
      open: 'never' 
    }],
    ['json', { 
      outputFile: 'test-results/advanced-test-results.json' 
    }],
    ['junit', { 
      outputFile: 'test-results/advanced-test-results.xml' 
    }]
  ],
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false, // Show browser for production testing
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    timeout: 60000,
    actionTimeout: 20000
  },
  projects: [
    {
      name: 'advanced-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          slowMo: 150 // Slow down for better visibility
        }
      },
    }
  ],
  expect: {
    timeout: 10000
  },
  outputDir: 'test-results/',
});
