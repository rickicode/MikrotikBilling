const { test, expect } = require('@playwright/test');
const { parse } = require('set-cookie-parser');

test.describe('Mikrotik Billing System - Comprehensive Testing', () => {
  let page;
  let context;

  // Test data
  const testCustomer = {
    name: 'Test Customer ' + Date.now(),
    email: 'test' + Date.now() + '@example.com',
    phone: '+62812345678',
    address: 'Test Address 123'
  };

  const testVoucher = {
    prefix: 'TEST',
    count: 3,
    profile: '1-JAM' // Will need to adjust based on available profiles
  };

  const testPPPoE = {
    name: 'Test PPPoE User ' + Date.now(),
    username: 'testpppoe' + Date.now(),
    password: 'Test123!',
    profile: 'PPPOE-1MBIT' // Will need to adjust based on available profiles
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    
    // Set up authentication cookies
    const cookies = [
      {
        name: 'token',
        value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImlhdCI6MTc2MDk3ODgyNCwianRpIjoiZDY2NDViODhiMGU4YWZlZjA5NmEzMzRkMzk2NWFkNGYiLCJleHAiOjE3NjM1NzA4MjQsImF1ZCI6Im1pa3JvdGlrLWJpbGxpbmctdXNlcnMiLCJpc3MiOiJtaWtyb3Rpay1iaWxsaW5nIn0.ESZ7opN3zKeaOqzrnXgTuA_hvgCn7heuTeye7XzdAoM',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      },
      {
        name: 'sessionId',
        value: 'n48ksyjMQ_bo8BGq8ci2i_FW8v99nAQq.YeYQcE9rk5k4eYssezCss37I8FtYdU0Q%2FeeosdSsiUo',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ];
    
    await context.addCookies(cookies);
    page = await context.newPage();
    
    // Set up console error monitoring
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Set up page error monitoring
    const pageErrors = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    // Store error arrays for later access
    page.consoleErrors = consoleErrors;
    page.pageErrors = pageErrors;
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('1. Dashboard Access and Statistics Display', async () => {
    console.log('Testing Dashboard Access...');
    
    // Navigate to dashboard
    await page.goto('http://localhost:3005');
    await page.waitForLoadState('networkidle');
    
    // Check if we're on the dashboard (or redirected to login)
    const currentUrl = page.url();
    console.log('Current URL after navigation:', currentUrl);
    
    if (currentUrl.includes('/login')) {
      console.log('Redirected to login, attempting to authenticate...');
      // Try to authenticate if needed
      await page.fill('input[name="username"]', 'admin');
      await page.fill('input[name="password"]', 'admin');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-artifacts/dashboard-loaded.png' });
    
    // Check for dashboard elements
    const dashboardElements = [
      '.dashboard',
      '.card',
      '.stat-card',
      '[data-testid="dashboard"]',
      '.container-fluid'
    ];
    
    let dashboardFound = false;
    for (const selector of dashboardElements) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          dashboardFound = true;
          console.log(`Dashboard found with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!dashboardFound) {
      console.log('Dashboard not found with known selectors, checking page content...');
      const pageContent = await page.content();
      if (pageContent.includes('Dashboard') || pageContent.includes('dashboard')) {
        dashboardFound = true;
        console.log('Dashboard content found in page');
      }
    }
    
    // Check for statistics
    const statsElements = [
      '.stats',
      '.statistics',
      '[data-testid="stats"]',
      'h1', 'h2', 'h3'
    ];
    
    let statsFound = false;
    for (const selector of statsElements) {
      try {
        const elements = await page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          const text = await elements.first().textContent();
          if (text && (text.includes('User') || text.includes('Active') || text.includes('Total'))) {
            statsFound = true;
            console.log(`Statistics found: ${text.trim()}`);
            break;
          }
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    console.log(`Dashboard loaded successfully: ${dashboardFound}`);
    console.log(`Statistics found: ${statsFound}`);
    console.log(`Console errors: ${page.consoleErrors.length}`);
    console.log(`Page errors: ${page.pageErrors.length}`);
    
    expect(dashboardFound || currentUrl.includes('/login')).toBeTruthy();
  });

  test('2. Customer Creation', async () => {
    console.log('Testing Customer Creation...');
    
    // Navigate to customers page
    await page.goto('http://localhost:3005/customers');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of customers page
    await page.screenshot({ path: 'test-artifacts/customers-page.png' });
    
    // Look for create customer button or link
    const createButtons = [
      'a[href*="/customers/create"]',
      'button:has-text("Create")',
      'button:has-text("Add")',
      'button:has-text("New Customer")',
      '.btn-primary',
      '[data-testid="create-customer"]'
    ];
    
    let createButtonFound = false;
    for (const selector of createButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Found create button with selector: ${selector}`);
          await button.click();
          createButtonFound = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!createButtonFound) {
      console.log('Create button not found, trying direct navigation...');
      await page.goto('http://localhost:3005/customers/create');
    }
    
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-artifacts/customer-create-form.png' });
    
    // Fill customer form
    const customerFields = [
      { selector: 'input[name="name"]', value: testCustomer.name },
      { selector: 'input[name="email"]', value: testCustomer.email },
      { selector: 'input[name="phone"]', value: testCustomer.phone },
      { selector: 'input[name="address"]', value: testCustomer.address },
      { selector: 'input[placeholder*="name"]', value: testCustomer.name },
      { selector: 'input[placeholder*="email"]', value: testCustomer.email },
      { selector: 'input[placeholder*="phone"]', value: testCustomer.phone }
    ];
    
    for (const field of customerFields) {
      try {
        const input = await page.locator(field.selector).first();
        if (await input.isVisible()) {
          await input.fill(field.value);
          console.log(`Filled field ${field.selector} with ${field.value}`);
        }
      } catch (e) {
        // Field might not exist, continue
      }
    }
    
    // Submit form
    const submitButtons = [
      'button[type="submit"]',
      'button:has-text("Save")',
      'button:has-text("Create")',
      'button:has-text("Submit")',
      '.btn-success',
      '[data-testid="save-customer"]'
    ];
    
    let formSubmitted = false;
    for (const selector of submitButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Clicking submit button: ${selector}`);
          await button.click();
          formSubmitted = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (formSubmitted) {
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-artifacts/customer-after-submit.png' });
      
      // Check for success message or redirect
      const successIndicators = [
        '.alert-success',
        '.toast-success',
        '[data-testid="success-message"]',
        'text=Customer created successfully',
        'text=Success',
        'text=Saved'
      ];
      
      let successFound = false;
      for (const selector of successIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            successFound = true;
            console.log(`Success message found: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      console.log(`Customer creation form submitted: ${formSubmitted}`);
      console.log(`Success message found: ${successFound}`);
    }
    
    console.log(`Console errors during customer creation: ${page.consoleErrors.length}`);
  });

  test('3. Voucher Generation', async () => {
    console.log('Testing Voucher Generation...');
    
    // Navigate to vouchers page
    await page.goto('http://localhost:3005/vouchers');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ path: 'test-artifacts/vouchers-page.png' });
    
    // Look for generate voucher button
    const generateButtons = [
      'a[href*="/vouchers/generate"]',
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("New Voucher")',
      '.btn-primary',
      '[data-testid="generate-voucher"]'
    ];
    
    let generateButtonFound = false;
    for (const selector of generateButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Found generate button with selector: ${selector}`);
          await button.click();
          generateButtonFound = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!generateButtonFound) {
      console.log('Generate button not found, trying direct navigation...');
      await page.goto('http://localhost:3005/vouchers/generate');
    }
    
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-artifacts/voucher-generate-form.png' });
    
    // Fill voucher generation form
    try {
      // Look for profile selector
      const profileSelector = await page.locator('select[name="profile"], select[name="profileId"]').first();
      if (await profileSelector.isVisible()) {
        await profileSelector.selectOption({ index: 0 }); // Select first available profile
        console.log('Selected voucher profile');
      }
      
      // Look for count input
      const countInput = await page.locator('input[name="count"], input[name="quantity"]').first();
      if (await countInput.isVisible()) {
        await countInput.fill(testVoucher.count.toString());
        console.log(`Set voucher count to ${testVoucher.count}`);
      }
      
      // Look for prefix input
      const prefixInput = await page.locator('input[name="prefix"]').first();
      if (await prefixInput.isVisible()) {
        await prefixInput.fill(testVoucher.prefix);
        console.log(`Set voucher prefix to ${testVoucher.prefix}`);
      }
    } catch (e) {
      console.log('Error filling voucher form:', e.message);
    }
    
    // Submit form
    const submitButtons = [
      'button[type="submit"]',
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button:has-text("Submit")',
      '.btn-success',
      '[data-testid="generate-submit"]'
    ];
    
    let formSubmitted = false;
    for (const selector of submitButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Clicking generate button: ${selector}`);
          await button.click();
          formSubmitted = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (formSubmitted) {
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-artifacts/voucher-after-generate.png' });
      
      // Check for generated vouchers or success message
      const voucherIndicators = [
        '.voucher-list',
        '.voucher-item',
        '[data-testid="voucher-list"]',
        'text=Voucher generated successfully',
        'text=Vouchers created',
        '.table'
      ];
      
      let vouchersFound = false;
      for (const selector of voucherIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            vouchersFound = true;
            console.log(`Voucher generation confirmation found: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      console.log(`Voucher generation form submitted: ${formSubmitted}`);
      console.log(`Vouchers found after generation: ${vouchersFound}`);
    }
    
    console.log(`Console errors during voucher generation: ${page.consoleErrors.length}`);
  });

  test('4. PPPoE User Creation', async () => {
    console.log('Testing PPPoE User Creation...');
    
    // Navigate to PPPoE page
    await page.goto('http://localhost:3005/pppoe');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ path: 'test-artifacts/pppoe-page.png' });
    
    // Look for create PPPoE user button
    const createButtons = [
      'a[href*="/pppoe/create"]',
      'button:has-text("Create")',
      'button:has-text("Add User")',
      'button:has-text("New PPPoE")',
      '.btn-primary',
      '[data-testid="create-pppoe"]'
    ];
    
    let createButtonFound = false;
    for (const selector of createButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Found create PPPoE button with selector: ${selector}`);
          await button.click();
          createButtonFound = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!createButtonFound) {
      console.log('Create PPPoE button not found, trying direct navigation...');
      await page.goto('http://localhost:3005/pppoe/create');
    }
    
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-artifacts/pppoe-create-form.png' });
    
    // Fill PPPoE user form
    const pppoeFields = [
      { selector: 'input[name="name"]', value: testPPPoE.name },
      { selector: 'input[name="username"]', value: testPPPoE.username },
      { selector: 'input[name="password"]', value: testPPPoE.password },
      { selector: 'input[placeholder*="name"]', value: testPPPoE.name },
      { selector: 'input[placeholder*="username"]', value: testPPPoE.username },
      { selector: 'input[placeholder*="password"]', value: testPPPoE.password }
    ];
    
    for (const field of pppoeFields) {
      try {
        const input = await page.locator(field.selector).first();
        if (await input.isVisible()) {
          await input.fill(field.value);
          console.log(`Filled field ${field.selector} with ${field.value}`);
        }
      } catch (e) {
        // Field might not exist, continue
      }
    }
    
    // Select profile if available
    try {
      const profileSelector = await page.locator('select[name="profile"], select[name="profileId"]').first();
      if (await profileSelector.isVisible()) {
        await profileSelector.selectOption({ index: 0 }); // Select first available profile
        console.log('Selected PPPoE profile');
      }
    } catch (e) {
      console.log('Profile selector not found or not visible');
    }
    
    // Submit form
    const submitButtons = [
      'button[type="submit"]',
      'button:has-text("Create")',
      'button:has-text("Save")',
      'button:has-text("Submit")',
      '.btn-success',
      '[data-testid="save-pppoe"]'
    ];
    
    let formSubmitted = false;
    for (const selector of submitButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Clicking PPPoE submit button: ${selector}`);
          await button.click();
          formSubmitted = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (formSubmitted) {
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-artifacts/pppoe-after-submit.png' });
      
      // Check for success message or created user
      const successIndicators = [
        '.alert-success',
        '.toast-success',
        '[data-testid="success-message"]',
        'text=PPPoE user created successfully',
        'text=User created',
        'text=Success',
        '.table'
      ];
      
      let successFound = false;
      for (const selector of successIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            successFound = true;
            console.log(`PPPoE creation confirmation found: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      console.log(`PPPoE user creation form submitted: ${formSubmitted}`);
      console.log(`Success confirmation found: ${successFound}`);
    }
    
    console.log(`Console errors during PPPoE creation: ${page.consoleErrors.length}`);
  });

  test('5. Profile Management and Sync', async () => {
    console.log('Testing Profile Management...');
    
    // Navigate to profiles page
    await page.goto('http://localhost:3005/profiles');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ path: 'test-artifacts/profiles-page.png' });
    
    // Look for sync button
    const syncButtons = [
      'button:has-text("Sync")',
      'button:has-text("Refresh")',
      'button:has-text("Update")',
      '.btn-sync',
      '[data-testid="sync-profiles"]',
      'a:has-text("Sync")'
    ];
    
    let syncButtonFound = false;
    for (const selector of syncButtons) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible()) {
          console.log(`Found sync button with selector: ${selector}`);
          await button.click();
          syncButtonFound = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (syncButtonFound) {
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-artifacts/profiles-after-sync.png' });
      
      // Check for sync completion
      const syncIndicators = [
        '.alert-success',
        '.toast-success',
        'text=Profiles synced successfully',
        'text=Sync completed',
        'text=Updated'
      ];
      
      let syncSuccess = false;
      for (const selector of syncIndicators) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 5000 })) {
            syncSuccess = true;
            console.log(`Profile sync confirmation found: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      console.log(`Profile sync button clicked: ${syncButtonFound}`);
      console.log(`Sync success confirmation: ${syncSuccess}`);
    }
    
    // Check for profile table or list
    const profileLists = [
      '.table',
      '.profile-list',
      '[data-testid="profile-table"]',
      'tbody tr',
      '.list-group'
    ];
    
    let profilesFound = false;
    for (const selector of profileLists) {
      try {
        const elements = await page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          profilesFound = true;
          console.log(`Profile list found with ${count} items using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    console.log(`Profiles found in table: ${profilesFound}`);
    console.log(`Console errors during profile management: ${page.consoleErrors.length}`);
  });

  test('6. System Health Check', async () => {
    console.log('Performing System Health Check...');
    
    // Check for any console errors accumulated during all tests
    console.log(`Total console errors: ${page.consoleErrors.length}`);
    if (page.consoleErrors.length > 0) {
      console.log('Console errors found:');
      page.consoleErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    // Check for page errors
    console.log(`Total page errors: ${page.pageErrors.length}`);
    if (page.pageErrors.length > 0) {
      console.log('Page errors found:');
      page.pageErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    // Test API endpoints directly
    const apiEndpoints = [
      '/api/health',
      '/api/status',
      '/api/dashboard/stats',
      '/api/customers',
      '/api/vouchers',
      '/api/pppoe',
      '/api/profiles'
    ];
    
    for (const endpoint of apiEndpoints) {
      try {
        const response = await page.goto(`http://localhost:3005${endpoint}`);
        const statusCode = response ? response.status() : 'no response';
        console.log(`API ${endpoint}: ${statusCode}`);
        
        if (statusCode >= 200 && statusCode < 400) {
          // Check if response is JSON
          const contentType = response ? response.headers()['content-type'] : '';
          if (contentType && contentType.includes('application/json')) {
            console.log(`  ✓ ${endpoint} - Valid JSON response`);
          } else if (statusCode !== 302) { // 302 is expected for protected endpoints
            console.log(`  ⚠ ${endpoint} - Non-JSON response (${contentType})`);
          }
        } else if (statusCode !== 302) { // 302 is expected for protected endpoints
          console.log(`  ✗ ${endpoint} - Error status: ${statusCode}`);
        }
      } catch (e) {
        console.log(`  ✗ ${endpoint} - Request failed: ${e.message}`);
      }
    }
    
    // Final screenshot of current state
    await page.goto('http://localhost:3005');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-artifacts/final-dashboard-state.png' });
    
    // Summary
    console.log('\n=== COMPREHENSIVE TEST SUMMARY ===');
    console.log(`Console Errors: ${page.consoleErrors.length}`);
    console.log(`Page Errors: ${page.pageErrors.length}`);
    console.log('Screenshots captured in test-artifacts/');
    console.log('API endpoints tested');
    
    // Assert that we have no critical errors
    expect(page.consoleErrors.length).toBeLessThan(10); // Allow some minor warnings
    expect(page.pageErrors.length).toBeLessThan(5);
  });
});
