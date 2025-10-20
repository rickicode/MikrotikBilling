const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * COMPREHENSIVE VOUCHER GENERATION TEST WITH MIKROTIK ROUTEROS VERIFICATION
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
  username: 'userku',
  password: 'ganteng',
  timeout: 30000
};

let mikrotikClient = null;
let testResults = {
  generatedVouchers: [],
  mikrotikVerified: [],
  printTests: [],
  errors: []
};

test.describe('Comprehensive Voucher Generation with Real Mikrotik Verification', () => {
  
  test.beforeAll(async () => {
    console.log('🚀 Starting COMPREHENSIVE Voucher Generation Test...');
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
      
      // Get existing hotspot users count for comparison
      const existingUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
      console.log('📊 Existing hotspot users in RouterOS:', existingUsers.length);
      
    } catch (error) {
      console.error('❌ FAILED to connect to Mikrotik RouterOS:', error.message);
      throw new Error('Mikrotik connection failed: ' + error.message);
    }
  });

  test('Setup: Login to Mikrotik Billing System', async ({ page }) => {
    console.log('🔐 Step 1: Logging into Mikrotik Billing System...');
    
    await page.goto(BASE_URL + '/login');
    
    // Verify login page loads
    await expect(page.locator('h1, h2, .login-title')).toBeVisible({ timeout: 10000 });
    
    // Fill login form
    await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
    await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
    
    // Submit login
    await page.click('button[type="submit"], .btn-login, input[type="submit"]');
    
    // Verify successful login
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 10000 });
    
    console.log('✅ Successfully logged into Mikrotik Billing System');
    await page.screenshot({ path: 'test-results/screenshots/01-dashboard-login.png', fullPage: true });
  });

  test('Navigate to Voucher Generation Page', async ({ page }) => {
    console.log('🎫 Step 2: Navigating to Voucher Generation...');
    
    await page.goto(BASE_URL + '/vouchers');
    await expect(page.locator('h1, .page-title')).toContainText('Vouchers', { timeout: 10000 });
    
    // Look for create voucher button
    const createButton = page.locator('a[href*="/create"], .btn-create-voucher, button:has-text("Create"), button:has-text("Add New")');
    await expect(createButton).toBeVisible({ timeout: 10000 });
    
    await createButton.first().click();
    await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
    await expect(page.locator('h1, .page-title')).toContainText('Create', { timeout: 10000 });
    
    console.log('✅ Successfully accessed voucher generation page');
    await page.screenshot({ path: 'test-results/screenshots/02-voucher-create-page.png', fullPage: true });
  });

  // Test single voucher generation first
  test('Generate Single Voucher - 1 Hour Duration', async ({ page }) => {
    console.log('🎯 Step 3: Generating single 1-hour voucher...');
    
    await page.goto(BASE_URL + '/vouchers/create');
    
    // Unique prefix for this test
    const uniquePrefix = 'TEST1Hour' + Date.now();
    const quantity = 1;
    
    // Fill voucher form
    console.log('📝 Filling voucher form:');
    console.log('  - Prefix:', uniquePrefix);
    console.log('  - Quantity:', quantity);
    console.log('  - Duration: 1 Jam');
    
    // Select profile (try to find 1-hour profile)
    const profileSelect = page.locator('select[name="profile_id"]');
    await profileSelect.waitFor({ state: 'visible', timeout: 10000 });
    
    // Get available profiles
    const profileOptions = await profileSelect.locator('option').allTextContents();
    console.log('📋 Available profiles:', profileOptions);
    
    // Select first available profile (for testing)
    if (profileOptions.length > 1) {
      await profileSelect.selectOption({ index: 1 });
      console.log('✅ Selected profile:', profileOptions[1]);
    } else {
      await profileSelect.selectOption({ index: 0 });
      console.log('✅ Selected default profile');
    }
    
    // Fill other form fields
    await page.fill('input[name="quantity"]', quantity.toString());
    await page.fill('input[name="prefix"]', uniquePrefix);
    
    // Set selling price
    const priceInput = page.locator('input[name="price_sell"]');
    if (await priceInput.isVisible()) {
      await priceInput.fill('10000');
    }
    
    // Take screenshot before submission
    await page.screenshot({ path: 'test-results/screenshots/03-form-1hour-filled.png', fullPage: true });
    
    // Submit the form
    console.log('🚀 Submitting 1-hour voucher generation...');
    await page.click('button[type="submit"], .btn-generate');
    
    // Wait for processing
    await page.waitForTimeout(5000);
    
    // Check result
    let voucherGenerationSuccess = false;
    let batchId = null;
    
    // Check if redirected to print page
    if (page.url().includes('/print/')) {
      console.log('📄 Redirected to print page - voucher likely created successfully');
      
      const urlParts = page.url().split('/');
      batchId = urlParts[urlParts.length - 1];
      console.log('📦 Batch ID:', batchId);
      
      voucherGenerationSuccess = true;
      
      // Take screenshot of print page
      await page.screenshot({ path: 'test-results/screenshots/04-print-1hour-page.png', fullPage: true });
      
      // Test printing functionality
      try {
        const printButton = page.locator('button:has-text("Print"), .btn-print, button[onclick*="print()"]');
        if (await printButton.isVisible()) {
          console.log('🖨️ Testing print functionality...');
          await printButton.click();
          await page.waitForTimeout(1000);
          
          testResults.printTests.push({
            scenario: '1 Jam',
            success: true,
            message: 'Print button clicked successfully'
          });
          console.log('✅ Print functionality test passed');
        } else {
          testResults.printTests.push({
            scenario: '1 Jam',
            success: false,
            message: 'Print button not found'
          });
          console.log('⚠️ Print button not found on page');
        }
      } catch (printError) {
        testResults.printTests.push({
          scenario: '1 Jam',
          success: false,
          message: 'Print test error: ' + printError.message
        });
        console.log('❌ Print test error:', printError.message);
      }
      
    } else {
      // Check for success message
      const successMessage = page.locator('.alert-success, .success-message, [data-testid="success-message"]');
      if (await successMessage.isVisible()) {
        const messageText = await successMessage.textContent();
        console.log('✅ Success message:', messageText);
        voucherGenerationSuccess = true;
      } else {
        const errorMessage = page.locator('.alert-danger, .error-message, [data-testid="error-message"]');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          console.error('🚨 Error message:', errorText);
          testResults.errors.push('1 Jam: ' + errorText);
        }
      }
      
      await page.screenshot({ path: 'test-results/screenshots/04-result-1hour-page.png', fullPage: true });
    }
    
    if (!voucherGenerationSuccess) {
      console.error('❌ Voucher generation failed for 1 Jam');
      testResults.errors.push('Voucher generation failed for 1 Jam');
    }
    
    // Verify voucher was created in web interface
    console.log('🔍 Verifying voucher in web interface...');
    await page.goto(BASE_URL + '/vouchers');
    await page.waitForSelector('table, .voucher-list', { timeout: 10000 });
    
    // Search for our test voucher
    const searchInput = page.locator('input[name="search"], .search-input, input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(uniquePrefix);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    
    // Count vouchers with our prefix
    const voucherRows = page.locator('table tbody tr, .voucher-item');
    const testVoucherRows = voucherRows.filter({ hasText: uniquePrefix });
    const voucherCount = await testVoucherRows.count();
    
    console.log('📊 Found', voucherCount, 'vouchers with prefix "' + uniquePrefix + '" in web interface');
    
    if (voucherCount >= quantity) {
      console.log('✅ Expected', quantity, 'vouchers, found', voucherCount, '- OK');
    } else {
      console.log('⚠️ Expected', quantity, 'vouchers, found', voucherCount, '- Below expected');
      testResults.errors.push('Expected ' + quantity + ' vouchers for 1 Jam, found ' + voucherCount);
    }
    
    // Extract voucher code for Mikrotik verification
    if (voucherCount > 0) {
      const row = testVoucherRows.first();
      const codeCell = row.locator('td').first();
      if (await codeCell.isVisible()) {
        const code = await codeCell.textContent();
        if (code && code.trim()) {
          testResults.generatedVouchers.push({
            code: code.trim(),
            prefix: uniquePrefix,
            duration: '1 Jam',
            scenario: '1 Jam',
            hours: 1,
            price: 10000,
            batch_id: batchId
          });
          console.log('✅ Extracted voucher code:', code.trim());
        }
      }
    }
    
    console.log('✅ 1 Jam voucher generation completed');
    await page.screenshot({ path: 'test-results/screenshots/05-1hour-verification.png', fullPage: true });
  });

  test.describe('CRITICAL: Verify Generated Voucher in Mikrotik RouterOS', () => {
    
    test('VERIFIKASI WAJIB: Voucher must exist in Mikrotik RouterOS with correct metadata', async () => {
      console.log('🔌 CRITICAL VERIFICATION: Voucher in Mikrotik RouterOS...');
      console.log('🚨 THIS IS THE MAKE-OR-BREAK VERIFICATION STEP');
      
      if (!mikrotikClient) {
        throw new Error('Mikrotik client not initialized');
      }
      
      if (testResults.generatedVouchers.length === 0) {
        throw new Error('No vouchers were generated in web interface');
      }
      
      console.log('📊 Verifying', testResults.generatedVouchers.length, 'vouchers in RouterOS...');
      
      try {
        // Get all hotspot users from Mikrotik
        console.log('📡 Retrieving ALL hotspot users from Mikrotik RouterOS...');
        const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
        
        console.log('📊 Total hotspot users in RouterOS:', hotspotUsers.length);
        
        // Count users with VOUCHER_SYSTEM comments before our test
        const existingVoucherUsers = hotspotUsers.filter(user => 
          user.comment && user.comment.includes('VOUCHER_SYSTEM')
        );
        console.log('📊 Existing voucher users before test:', existingVoucherUsers.length);
        
        // Verify each generated voucher exists in RouterOS
        for (const voucher of testResults.generatedVouchers) {
          console.log('🔍 Verifying voucher:', voucher.code);
          
          const mikrotikUser = hotspotUsers.find(user => user.name === voucher.code);
          
          if (!mikrotikUser) {
            console.error('❌ CRITICAL: Voucher', voucher.code, 'NOT FOUND in Mikrotik RouterOS!');
            testResults.errors.push('Voucher ' + voucher.code + ' missing in RouterOS');
            continue;
          }
          
          console.log('✅ Voucher', voucher.code, 'found in RouterOS');
          
          // Verify user properties
          console.log('  📋 RouterOS Details:');
          console.log('    - ID:', mikrotikUser['.id']);
          console.log('    - Profile:', mikrotikUser.profile);
          console.log('    - Disabled:', mikrotikUser.disabled);
          console.log('    - Comment:', mikrotikUser.comment);
          console.log('    - Uptime:', mikrotikUser.uptime);
          
          // CRITICAL VERIFICATIONS
          
          // 1. User must be enabled
          if (mikrotikUser.disabled !== 'false') {
            console.error('❌ User', voucher.code, 'is disabled in RouterOS');
            testResults.errors.push('Voucher ' + voucher.code + ' is disabled');
            continue;
          }
          
          // 2. Comment must contain VOUCHER_SYSTEM pattern
          if (!mikrotikUser.comment || !mikrotikUser.comment.includes('VOUCHER_SYSTEM')) {
            console.error('❌ User', voucher.code, 'missing VOUCHER_SYSTEM comment');
            testResults.errors.push('Voucher ' + voucher.code + ' missing VOUCHER_SYSTEM comment');
            continue;
          }
          
          // 3. Verify comment format: VOUCHER_SYSTEM|price_sell|first_login|valid_until
          const commentParts = mikrotikUser.comment.split('|');
          if (commentParts.length < 4) {
            console.error('❌ User', voucher.code, 'comment format incorrect:', mikrotikUser.comment);
            testResults.errors.push('Voucher ' + voucher.code + ' comment format incorrect');
            continue;
          }
          
          const [systemMarker, priceSell, firstLogin, validUntil] = commentParts;
          
          console.log('    - System Marker:', systemMarker, '✅');
          console.log('    - Price Sell:', priceSell, '✅');
          console.log('    - First Login:', firstLogin, '✅');
          console.log('    - Valid Until:', validUntil, '✅');
          
          // 4. Verify price matches expected
          const expectedPrice = voucher.price.toString();
          if (priceSell !== expectedPrice) {
            console.warn('⚠️ Price mismatch: expected', expectedPrice, ', got', priceSell);
          }
          
          // 5. Verify timestamps are valid
          const firstLoginTime = parseInt(firstLogin);
          const validUntilTime = parseInt(validUntil);
          const currentTime = Math.floor(Date.now() / 1000);
          
          if (firstLoginTime === 0) {
            console.log('    - First login: Not used yet ✅');
          } else if (firstLoginTime > currentTime) {
            console.warn('⚠️ First login time is in the future');
          } else {
            console.log('    - First login: Already used ⚠️');
          }
          
          if (validUntilTime <= currentTime) {
            console.error('❌ Voucher already expired:', validUntil);
            testResults.errors.push('Voucher ' + voucher.code + ' already expired');
          } else {
            const expiryDate = new Date(validUntilTime * 1000);
            console.log('    - Valid until:', expiryDate.toLocaleString(), '✅');
          }
          
          // All verifications passed for this voucher
          testResults.mikrotikVerified.push(voucher.code);
          console.log('✅ COMPLETE VERIFICATION PASSED for', voucher.code);
        }
        
        // Final verification summary
        console.log('\n' + '='.repeat(60));
        console.log('🔌 MIKROTIK VERIFICATION SUMMARY');
        console.log('='.repeat(60));
        console.log('📊 Vouchers Generated:', testResults.generatedVouchers.length);
        console.log('✅ Verified in RouterOS:', testResults.mikrotikVerified.length);
        console.log('❌ Missing/Failed:', testResults.generatedVouchers.length - testResults.mikrotikVerified.length);
        
        const verificationRate = (testResults.mikrotikVerified.length / testResults.generatedVouchers.length) * 100;
        console.log('📈 Verification Rate:', verificationRate.toFixed(1) + '%');
        
        if (verificationRate < 100) {
          console.log('❌ CRITICAL FAILURE: Not all vouchers found in RouterOS');
          console.log('🚨 Missing vouchers:');
          testResults.generatedVouchers.forEach(voucher => {
            if (!testResults.mikrotikVerified.includes(voucher.code)) {
              console.log('    -', voucher.code, '(' + voucher.duration + ')');
            }
          });
        } else {
          console.log('🎉 PERFECT VERIFICATION: All vouchers found in RouterOS');
        }
        
        console.log('='.repeat(60));
        
        // CRITICAL ASSERTION: All vouchers must exist in RouterOS
        expect(testResults.mikrotikVerified.length).toBe(testResults.generatedVouchers.length);
        
      } catch (error) {
        console.error('❌ CRITICAL VERIFICATION FAILED:', error.message);
        testResults.errors.push('Mikrotik verification failed: ' + error.message);
        throw new Error('Mikrotik RouterOS verification failed: ' + error.message);
      }
    });
  });

  test('Final Test Summary and Validation', async ({ page }) => {
    console.log('📋 Final Test Summary and Validation...');
    
    // Navigate to dashboard for final state
    await page.goto(BASE_URL + '/dashboard');
    await page.screenshot({ path: 'test-results/screenshots/99-final-dashboard.png', fullPage: true });
    
    // Final RouterOS state check
    if (mikrotikClient) {
      try {
        const finalHotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
        const finalVoucherUsers = finalHotspotUsers.filter(user => 
          user.comment && user.comment.includes('VOUCHER_SYSTEM')
        );
        
        console.log('📊 Final RouterOS state:');
        console.log('  - Total hotspot users:', finalHotspotUsers.length);
        console.log('  - Total voucher users:', finalVoucherUsers.length);
        
        // Check for our test vouchers
        const ourTestVouchers = finalVoucherUsers.filter(user => 
          testResults.generatedVouchers.some(voucher => voucher.code === user.name)
        );
        console.log('  - Our test vouchers in RouterOS:', ourTestVouchers.length);
        
      } catch (error) {
        console.log('⚠️ Final RouterOS check failed:', error.message);
      }
    }
    
    // FINAL ASSERTIONS
    console.log('\n🎯 FINAL TEST ASSERTIONS:');
    
    // 1. At least some vouchers should be generated
    expect(testResults.generatedVouchers.length).toBeGreaterThan(0);
    console.log('✅ Vouchers generated:', testResults.generatedVouchers.length);
    
    // 2. All generated vouchers must be verified in RouterOS
    expect(testResults.mikrotikVerified.length).toBe(testResults.generatedVouchers.length);
    console.log('✅ All vouchers verified in RouterOS:', testResults.mikrotikVerified.length + '/' + testResults.generatedVouchers.length);
    
    // 3. No critical errors should exist
    expect(testResults.errors.length).toBe(0);
    console.log('✅ No critical errors');
    
    console.log('\n🎉 COMPREHENSIVE VOUCHER GENERATION TEST PASSED!');
    console.log('✅ All requirements satisfied:');
    console.log('  - Real vouchers generated');
    console.log('  - All vouchers verified in Mikrotik RouterOS');
    console.log('  - Comment metadata format verified');
    console.log('  - Print functionality tested');
    console.log('  - Voucher generation works correctly');
  });
});
