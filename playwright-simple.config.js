const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*simple-production-test.spec.js',
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
      outputFile: 'test-results/simple-test-results.json' 
    }]
  ],
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false, // Show browser
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    timeout: 60000,
    actionTimeout: 20000
  },
  projects: [
    {
      name: 'simple-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          slowMo: 200 // Slow down for better visibility
        }
      },
    }
  ],
  expect: {
    timeout: 10000
  },
  outputDir: 'test-results/',
});
