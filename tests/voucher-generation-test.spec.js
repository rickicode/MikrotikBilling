const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * CRITICAL VOUCHER GENERATION TEST WITH MIKROTIK ROUTEROS VERIFICATION
 */

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3005';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// Mikrotik RouterOS configuration for verification
const MIKROTIK_CONFIG = {
  host: '54.37.252.142',
  port: 8728,
  username: 'admin',
  password: 'MikrotikPass123!',
  timeout: 30000
};

// Test data
const TEST_VOUCHER_DATA = {
  prefix: 'TEST' + Date.now(),
  quantity: 5,
  profile: '1-Hour',
  price_sell: 10000,
  duration_days: 7
};

let mikrotikClient = null;
let generatedVouchers = [];

test.describe('Voucher Generation with Mikrotik RouterOS Verification', () => {
  
  test.beforeAll(async () => {
    console.log('🚀 Starting CRITICAL Voucher Generation Test with Mikrotik Verification...');
    console.log('📡 Web Interface:', BASE_URL);
    console.log('🔌 Mikrotik RouterOS:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
    
    // Initialize Mikrotik client for verification
    try {
      console.log('🔌 Initializing Mikrotik RouterOS connection for verification...');
      mikrotikClient = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
      await mikrotikClient.connect();
      await mikrotikClient.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
      
      // Test connection
      const identity = await mikrotikClient.runQuery('/system/identity/print');
      const identityName = identity && identity.length > 0 ? 
        (identity[0].name || identity[0]['identity-name'] || identity[0].identity || 'Unknown') : 
        'Unknown';
      console.log('✅ Connected to Mikrotik:', identityName);
      
    } catch (error) {
      console.error('❌ FAILED to connect to Mikrotik RouterOS:', error.message);
      throw new Error('Mikrotik connection failed: ' + error.message);
    }
  });

  test.afterAll(async () => {
    // Cleanup Mikrotik connection
    if (mikrotikClient) {
      try {
        await mikrotikClient.close();
        console.log('✅ Mikrotik connection closed');
      } catch (error) {
        console.warn('Warning: Failed to close Mikrotik connection:', error.message);
      }
    }
    
    console.log('🏁 Voucher Generation Test Completed');
  });

  test.describe('1. System Authentication', () => {
    
    test('should login to Mikrotik Billing System', async ({ page }) => {
      console.log('🔐 Step 1: Logging into Mikrotik Billing System...');
      
      await page.goto(BASE_URL + '/login');
      
      // Verify login page loads
      await expect(page.locator('h1, h2, .login-title')).toBeVisible({ timeout: 10000 });
      
      // Fill login form
      await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
      
      // Submit login
      await page.click('button[type="submit"], .btn-login, input[type="submit"]');
      
      // Verify successful login - should redirect to dashboard
      await page.waitForURL(BASE_URL + '/dashboard', { timeout: 15000 });
      await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 10000 });
      
      console.log('✅ Successfully logged into Mikrotik Billing System');
      
      // Take screenshot for verification
      await page.screenshot({ path: 'test-results/screenshots/01-dashboard-login.png', fullPage: true });
    });
  });

  test.describe('2. Navigate to Voucher Generation', () => {
    
    test('should access voucher generation page', async ({ page }) => {
      console.log('🎫 Step 3: Navigating to Voucher Generation...');
      
      // Navigate to vouchers list first
      await page.goto(BASE_URL + '/vouchers');
      await expect(page.locator('h1, .page-title')).toContainText('Vouchers', { timeout: 10000 });
      
      // Look for create voucher button
      const createButton = page.locator('a[href*="/create"], .btn-create-voucher, button:has-text("Create"), button:has-text("Add New")');
      await expect(createButton).toBeVisible({ timeout: 10000 });
      
      // Click to create new voucher
      await createButton.first().click();
      
      // Verify voucher creation page loads
      await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
      await expect(page.locator('h1, .page-title')).toContainText('Create', { timeout: 10000 });
      
      console.log('✅ Successfully accessed voucher generation page');
      
      // Take screenshot
      await page.screenshot({ path: 'test-results/screenshots/02-voucher-create-page.png', fullPage: true });
    });
  });

  test.describe('3. Generate New Vouchers', () => {
    
    test('should generate 5 new vouchers', async ({ page }) => {
      console.log('🎯 Step 5: Generating 5 new vouchers...');
      
      await page.goto(BASE_URL + '/vouchers/create');
      
      // Fill the voucher form
      console.log('📝 Filling voucher form...');
      
      // Select profile (try to find the first available option)
      const profileSelect = page.locator('select[name="profile_id"]');
      await profileSelect.selectOption({ index: 0 }); // Select first option
      
      // Fill other fields
      await page.fill('input[name="quantity"]', TEST_VOUCHER_DATA.quantity.toString());
      await page.fill('input[name="prefix"]', TEST_VOUCHER_DATA.prefix);
      await page.fill('input[name="price_sell"]', TEST_VOUCHER_DATA.price_sell.toString());
      
      // Optional: Set duration if field exists
      const durationDaysField = page.locator('input[name="duration_days"]');
      if (await durationDaysField.isVisible()) {
        await durationDaysField.fill(TEST_VOUCHER_DATA.duration_days.toString());
      }
      
      console.log('📊 Form details:');
      console.log('  - Prefix:', TEST_VOUCHER_DATA.prefix);
      console.log('  - Quantity:', TEST_VOUCHER_DATA.quantity);
      console.log('  - Price:', TEST_VOUCHER_DATA.price_sell);
      
      // Take screenshot before submission
      await page.screenshot({ path: 'test-results/screenshots/03-voucher-form-filled.png', fullPage: true });
      
      // Submit the form
      console.log('🚀 Submitting voucher generation form...');
      await page.click('button[type="submit"]');
      
      // Wait for processing
      try {
        await page.waitForTimeout(5000); // Wait for processing
        
        // Check if redirected to print page (common behavior)
        if (page.url().includes('/print/')) {
          console.log('📄 Redirected to print page - vouchers likely created successfully');
          
          // Extract batch ID from URL
          const urlParts = page.url().split('/');
          const batchId = urlParts[urlParts.length - 1];
          console.log('📦 Batch ID:', batchId);
          
          // Take screenshot of print page
          await page.screenshot({ path: 'test-results/screenshots/04-voucher-print-page.png', fullPage: true });
          
        } else {
          // Look for success message
          const successMessage = page.locator('.alert-success, .success-message, [data-testid="success-message"]');
          if (await successMessage.isVisible()) {
            const messageText = await successMessage.textContent();
            console.log('✅ Success message:', messageText);
          }
          
          // Take screenshot of result page
          await page.screenshot({ path: 'test-results/screenshots/04-voucher-result-page.png', fullPage: true });
        }
        
      } catch (error) {
        console.error('❌ Error during voucher submission:', error.message);
        
        // Take screenshot of error state
        await page.screenshot({ path: 'test-results/screenshots/04-voucher-error-state.png', fullPage: true });
        
        // Check for error messages
        const errorMessage = page.locator('.alert-danger, .error-message, [data-testid="error-message"]');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          console.error('🚨 Error message:', errorText);
        }
        
        throw new Error('Voucher generation failed: ' + error.message);
      }
      
      console.log('✅ Voucher generation submitted successfully');
    });
    
    test('should verify vouchers in web interface', async ({ page }) => {
      console.log('🔍 Step 6: Verifying vouchers in web interface...');
      
      // Navigate to vouchers list
      await page.goto(BASE_URL + '/vouchers');
      
      // Wait for page to load
      await page.waitForSelector('table, .voucher-list', { timeout: 10000 });
      
      // Search for our test vouchers
      const searchInput = page.locator('input[name="search"], .search-input, input[placeholder*="Search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill(TEST_VOUCHER_DATA.prefix);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
      
      // Count vouchers with our prefix
      const voucherRows = page.locator('table tbody tr, .voucher-item');
      const testVoucherRows = voucherRows.filter({ hasText: TEST_VOUCHER_DATA.prefix });
      
      const voucherCount = await testVoucherRows.count();
      console.log('📊 Found', voucherCount, 'vouchers with prefix "' + TEST_VOUCHER_DATA.prefix + '" in web interface');
      
      // Should have at least the quantity we generated
      expect(voucherCount).toBeGreaterThanOrEqual(TEST_VOUCHER_DATA.quantity);
      
      // Extract voucher codes for verification
      generatedVouchers = [];
      for (let i = 0; i < Math.min(voucherCount, TEST_VOUCHER_DATA.quantity); i++) {
        const row = testVoucherRows.nth(i);
        const codeCell = row.locator('td').first(); // Assuming first column has the code
        if (await codeCell.isVisible()) {
          const code = await codeCell.textContent();
          if (code && code.trim()) {
            generatedVouchers.push(code.trim());
          }
        }
      }
      
      console.log('🎫 Generated voucher codes:', generatedVouchers.join(', '));
      
      // Take screenshot of voucher list
      await page.screenshot({ path: 'test-results/screenshots/05-voucher-list-verification.png', fullPage: true });
      
      console.log('✅ Voucher verification in web interface completed');
    });
  });

  test.describe('4. CRITICAL: Verify in Mikrotik RouterOS', () => {
    
    test('VERIFIKASI WAJIB: vouchers must exist in Mikrotik RouterOS', async () => {
      console.log('🔌 Step 7: CRITICAL VERIFICATION in Mikrotik RouterOS...');
      console.log('🚨 THIS IS THE CRITICAL VERIFICATION STEP');
      
      if (!mikrotikClient) {
        throw new Error('Mikrotik client not initialized');
      }
      
      if (generatedVouchers.length === 0) {
        throw new Error('No vouchers found in web interface to verify');
      }
      
      try {
        // Get all hotspot users from Mikrotik
        console.log('📡 Retrieving hotspot users from Mikrotik RouterOS...');
        const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
        
        console.log('📊 Total hotspot users in RouterOS:', hotspotUsers.length);
        
        // Filter for our test vouchers
        const mikrotikVouchers = hotspotUsers.filter(user => {
          return generatedVouchers.some(voucher => user.name === voucher);
        });
        
        console.log('🎫 Found', mikrotikVouchers.length, 'of our vouchers in RouterOS');
        
        // CRITICAL: All generated vouchers must exist in RouterOS
        expect(mikrotikVouchers.length).toBe(generatedVouchers.length);
        
        // Verify each voucher details
        for (const voucher of generatedVouchers) {
          const mikrotikUser = mikrotikVouchers.find(u => u.name === voucher);
          
          if (!mikrotikUser) {
            throw new Error('CRITICAL: Voucher ' + voucher + ' NOT FOUND in Mikrotik RouterOS!');
          }
          
          console.log('✅ Voucher', voucher, 'found in RouterOS:');
          console.log('  - Name:', mikrotikUser.name);
          console.log('  - Profile:', mikrotikUser.profile);
          console.log('  - Disabled:', mikrotikUser.disabled);
          console.log('  - Comment:', mikrotikUser.comment || 'No comment');
          
          // Verify user is enabled
          expect(mikrotikUser.disabled).toBe('false');
          
          // Verify comment pattern if exists
          if (mikrotikUser.comment) {
            const commentPattern = /VOUCHER_SYSTEM|voucher|batch/i;
            const hasValidComment = commentPattern.test(mikrotikUser.comment);
            console.log('  - Valid comment pattern:', hasValidComment ? '✅' : '⚠️');
          }
        }
        
        console.log('✅ CRITICAL VERIFICATION PASSED: All vouchers found in Mikrotik RouterOS');
        
      } catch (error) {
        console.error('❌ CRITICAL VERIFICATION FAILED:', error.message);
        throw new Error('Mikrotik RouterOS verification failed: ' + error.message);
      }
    });
  });

  test.describe('5. Final Verification and Summary', () => {
    
    test('should provide comprehensive test summary', async ({ page }) => {
      console.log('📋 Step 11: Final Test Summary...');
      
      // Final screenshot of dashboard
      await page.goto(BASE_URL + '/dashboard');
      await page.screenshot({ path: 'test-results/screenshots/07-final-dashboard.png', fullPage: true });
      
      console.log('\n' + '='.repeat(60));
      console.log('🎯 VOUCHER GENERATION TEST SUMMARY');
      console.log('='.repeat(60));
      console.log('📡 Web Interface:', BASE_URL);
      console.log('🔌 Mikrotik RouterOS:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
      console.log('🎫 Vouchers Generated:', generatedVouchers.length);
      console.log('🏷️  Voucher Prefix:', TEST_VOUCHER_DATA.prefix);
      console.log('💰 Price per Voucher:', TEST_VOUCHER_DATA.price_sell);
      console.log('⏰ Duration:', TEST_VOUCHER_DATA.duration_days, 'days');
      console.log('');
      
      if (generatedVouchers.length > 0) {
        console.log('✅ SUCCESSFUL VOUCHERS:');
        generatedVouchers.forEach((voucher, index) => {
          console.log('  ' + (index + 1) + '. ' + voucher);
        });
        console.log('');
      }
      
      // Final RouterOS verification
      if (mikrotikClient && generatedVouchers.length > 0) {
        try {
          const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
          const verifiedCount = hotspotUsers.filter(user => 
            generatedVouchers.some(voucher => user.name === voucher)
          ).length;
          
          console.log('🔌 RouterOS Verification:', verifiedCount + '/' + generatedVouchers.length + ' vouchers found');
          
          if (verifiedCount === generatedVouchers.length) {
            console.log('✅ CRITICAL VERIFICATION: PASSED');
            console.log('🎉 ALL VOUCHERS SUCCESSFULLY CREATED IN MIKROTIK ROUTEROS');
          } else {
            console.log('❌ CRITICAL VERIFICATION: FAILED');
            console.log('🚨 MISSING VOUCHERS IN ROUTEROS:', generatedVouchers.length - verifiedCount);
          }
        } catch (error) {
          console.log('⚠️ Final RouterOS verification failed:', error.message);
        }
      }
      
      console.log('='.repeat(60));
      console.log('🏁 TEST COMPLETED');
      console.log('='.repeat(60));
      
      // CRITICAL ASSERTION: All vouchers must exist in RouterOS
      if (mikrotikClient && generatedVouchers.length > 0) {
        const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
        const verifiedCount = hotspotUsers.filter(user => 
          generatedVouchers.some(voucher => user.name === voucher)
        ).length;
        
        expect(verifiedCount).toBe(generatedVouchers.length);
        console.log('✅ FINAL ASSERTION PASSED: All vouchers verified in RouterOS');
      }
    });
  });
});
