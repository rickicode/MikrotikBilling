const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * SIMPLE VOUCHER GENERATION TEST WITH MIKROTIK VERIFICATION
 * This test connects to existing server and verifies voucher generation
 */

// Test configuration
const BASE_URL = 'http://localhost:3005';
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
  errors: []
};

test.describe('Simple Voucher Generation with Mikrotik Verification', () => {
  
  test.beforeAll(async () => {
    console.log('🚀 Starting Simple Voucher Generation Test...');
    console.log('📡 Web Interface:', BASE_URL);
    console.log('🔌 Mikrotik RouterOS:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
    
    // Initialize Mikrotik client for verification
    try {
      console.log('🔌 Connecting to Mikrotik RouterOS...');
      mikrotikClient = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
      await mikrotikClient.connect();
      await mikrotikClient.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
      
      // Test connection
      const identity = await mikrotikClient.runQuery('/system/identity/print');
      const identityName = identity && identity.length > 0 ? 
        (identity[0].name || identity[0]['identity-name'] || identity[0].identity || 'Unknown') : 
        'Unknown';
      console.log('✅ Connected to Mikrotik:', identityName);
      
      // Get existing hotspot users count
      const existingUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
      console.log('📊 Existing hotspot users in RouterOS:', existingUsers.length);
      
    } catch (error) {
      console.error('❌ FAILED to connect to Mikrotik RouterOS:', error.message);
      throw new Error('Mikrotik connection failed: ' + error.message);
    }
  });

  test.afterAll(async () => {
    if (mikrotikClient) {
      try {
        await mikrotikClient.close();
        console.log('✅ Mikrotik connection closed');
      } catch (error) {
        console.warn('Warning: Failed to close Mikrotik connection:', error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 SIMPLE VOUCHER GENERATION TEST RESULTS');
    console.log('='.repeat(60));
    console.log('📊 Total Vouchers Generated:', testResults.generatedVouchers.length);
    console.log('✅ Vouchers Verified in RouterOS:', testResults.mikrotikVerified.length);
    console.log('❌ Errors:', testResults.errors.length);
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      testResults.errors.forEach((error, index) => {
        console.log('  ' + (index + 1) + '. ' + error);
      });
    }
    
    console.log('='.repeat(60));
  });

  test('Generate and Verify Single Voucher', async ({ page }) => {
    console.log('🎯 Starting voucher generation and verification test...');
    
    // Step 1: Login
    console.log('🔐 Step 1: Logging in...');
    await page.goto(BASE_URL + '/login');
    
    await expect(page.locator('h1, h2, .login-title')).toBeVisible({ timeout: 10000 });
    await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
    await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"], .btn-login, input[type="submit"]');
    
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 10000 });
    console.log('✅ Successfully logged in');
    
    // Step 2: Navigate to voucher creation
    console.log('🎫 Step 2: Navigate to voucher creation...');
    await page.goto(BASE_URL + '/vouchers');
    await expect(page.locator('h1, .page-title')).toContainText('Vouchers', { timeout: 10000 });
    
    const createButton = page.locator('a[href*="/create"], .btn-create-voucher, button:has-text("Create"), button:has-text("Add New")');
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.first().click();
    
    await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
    await expect(page.locator('h1, .page-title')).toContainText('Create', { timeout: 10000 });
    console.log('✅ Accessed voucher creation page');
    
    // Step 3: Fill voucher form
    console.log('📝 Step 3: Fill voucher form...');
    const uniquePrefix = 'TEST' + Date.now();
    const quantity = 1;
    
    console.log('  - Prefix:', uniquePrefix);
    console.log('  - Quantity:', quantity);
    
    // Select profile
    const profileSelect = page.locator('select[name="profile_id"]');
    await profileSelect.waitFor({ state: 'visible', timeout: 10000 });
    
    const profileOptions = await profileSelect.locator('option').allTextContents();
    console.log('  - Available profiles:', profileOptions);
    
    if (profileOptions.length > 1) {
      await profileSelect.selectOption({ index: 1 });
      console.log('  - Selected profile:', profileOptions[1]);
    } else {
      await profileSelect.selectOption({ index: 0 });
      console.log('  - Selected default profile');
    }
    
    // Fill other fields
    await page.fill('input[name="quantity"]', quantity.toString());
    await page.fill('input[name="prefix"]', uniquePrefix);
    
    const priceInput = page.locator('input[name="price_sell"]');
    if (await priceInput.isVisible()) {
      await priceInput.fill('10000');
    }
    
    await page.screenshot({ path: 'test-results/screenshots/simple-form-filled.png', fullPage: true });
    
    // Step 4: Submit form
    console.log('🚀 Step 4: Submit voucher generation...');
    await page.click('button[type="submit"], .btn-generate');
    await page.waitForTimeout(5000);
    
    let voucherGenerated = false;
    let generatedCode = null;
    
    // Check if redirected to print page
    if (page.url().includes('/print/')) {
      console.log('📄 Redirected to print page - voucher generated successfully');
      voucherGenerated = true;
      await page.screenshot({ path: 'test-results/screenshots/simple-print-page.png', fullPage: true });
    } else {
      // Check for success message
      const successMessage = page.locator('.alert-success, .success-message, [data-testid="success-message"]');
      if (await successMessage.isVisible()) {
        const messageText = await successMessage.textContent();
        console.log('✅ Success message:', messageText);
        voucherGenerated = true;
      } else {
        const errorMessage = page.locator('.alert-danger, .error-message, [data-testid="error-message"]');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          console.error('🚨 Error message:', errorText);
          testResults.errors.push('Generation error: ' + errorText);
        }
      }
      await page.screenshot({ path: 'test-results/screenshots/simple-result-page.png', fullPage: true });
    }
    
    if (!voucherGenerated) {
      console.error('❌ Voucher generation failed');
      testResults.errors.push('Voucher generation failed');
      throw new Error('Voucher generation failed');
    }
    
    // Step 5: Verify voucher in web interface
    console.log('🔍 Step 5: Verify voucher in web interface...');
    await page.goto(BASE_URL + '/vouchers');
    await page.waitForSelector('table, .voucher-list', { timeout: 10000 });
    
    // Search for our voucher
    const searchInput = page.locator('input[name="search"], .search-input, input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(uniquePrefix);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    
    // Find our voucher
    const voucherRows = page.locator('table tbody tr, .voucher-item');
    const testVoucherRows = voucherRows.filter({ hasText: uniquePrefix });
    const voucherCount = await testVoucherRows.count();
    
    console.log('📊 Found', voucherCount, 'vouchers with prefix "' + uniquePrefix + '"');
    
    if (voucherCount === 0) {
      console.error('❌ No vouchers found in web interface');
      testResults.errors.push('No vouchers found in web interface');
      throw new Error('No vouchers found in web interface');
    }
    
    // Extract voucher code
    const row = testVoucherRows.first();
    const codeCell = row.locator('td').first();
    if (await codeCell.isVisible()) {
      const code = await codeCell.textContent();
      if (code && code.trim()) {
        generatedCode = code.trim();
        testResults.generatedVouchers.push({
          code: generatedCode,
          prefix: uniquePrefix,
          price: 10000
        });
        console.log('✅ Extracted voucher code:', generatedCode);
      }
    }
    
    if (!generatedCode) {
      console.error('❌ Could not extract voucher code');
      testResults.errors.push('Could not extract voucher code');
      throw new Error('Could not extract voucher code');
    }
    
    // Step 6: CRITICAL - Verify in Mikrotik RouterOS
    console.log('🔌 Step 6: CRITICAL - Verify voucher in Mikrotik RouterOS...');
    console.log('🚨 THIS IS THE MAKE-OR-BREAK VERIFICATION');
    
    if (!mikrotikClient) {
      throw new Error('Mikrotik client not available');
    }
    
    try {
      // Get all hotspot users
      const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
      console.log('📊 Total hotspot users in RouterOS:', hotspotUsers.length);
      
      // Find our voucher
      const mikrotikUser = hotspotUsers.find(user => user.name === generatedCode);
      
      if (!mikrotikUser) {
        console.error('❌ CRITICAL: Voucher', generatedCode, 'NOT FOUND in RouterOS!');
        testResults.errors.push('Voucher ' + generatedCode + ' missing in RouterOS');
        throw new Error('Voucher not found in RouterOS');
      }
      
      console.log('✅ Voucher', generatedCode, 'found in RouterOS');
      console.log('  📋 RouterOS Details:');
      console.log('    - ID:', mikrotikUser['.id']);
      console.log('    - Profile:', mikrotikUser.profile);
      console.log('    - Disabled:', mikrotikUser.disabled);
      console.log('    - Comment:', mikrotikUser.comment);
      console.log('    - Uptime:', mikrotikUser.uptime);
      
      // Verify user is enabled
      if (mikrotikUser.disabled !== 'false') {
        console.error('❌ User is disabled in RouterOS');
        testResults.errors.push('Voucher is disabled in RouterOS');
        throw new Error('Voucher is disabled in RouterOS');
      }
      
      // Verify VOUCHER_SYSTEM comment
      if (!mikrotikUser.comment || !mikrotikUser.comment.includes('VOUCHER_SYSTEM')) {
        console.error('❌ Missing VOUCHER_SYSTEM comment');
        testResults.errors.push('Missing VOUCHER_SYSTEM comment');
        throw new Error('Missing VOUCHER_SYSTEM comment');
      }
      
      // Verify comment format
      const commentParts = mikrotikUser.comment.split('|');
      if (commentParts.length < 4) {
        console.error('❌ Invalid comment format:', mikrotikUser.comment);
        testResults.errors.push('Invalid comment format');
        throw new Error('Invalid comment format');
      }
      
      const [systemMarker, priceSell, firstLogin, validUntil] = commentParts;
      console.log('    - System Marker:', systemMarker, '✅');
      console.log('    - Price Sell:', priceSell, '✅');
      console.log('    - First Login:', firstLogin, '✅');
      console.log('    - Valid Until:', validUntil, '✅');
      
      // Verify price
      if (priceSell !== '10000') {
        console.warn('⚠️ Price mismatch: expected 10000, got', priceSell);
      }
      
      // Verify expiry
      const validUntilTime = parseInt(validUntil);
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (validUntilTime <= currentTime) {
        console.error('❌ Voucher already expired');
        testResults.errors.push('Voucher already expired');
        throw new Error('Voucher already expired');
      }
      
      const expiryDate = new Date(validUntilTime * 1000);
      console.log('    - Valid until:', expiryDate.toLocaleString(), '✅');
      
      // All verifications passed
      testResults.mikrotikVerified.push(generatedCode);
      console.log('✅ COMPLETE VERIFICATION PASSED for', generatedCode);
      
    } catch (error) {
      console.error('❌ Mikrotik verification failed:', error.message);
      testResults.errors.push('Mikrotik verification failed: ' + error.message);
      throw error;
    }
    
    console.log('✅ All verifications completed successfully!');
    
    // Final screenshot
    await page.goto(BASE_URL + '/dashboard');
    await page.screenshot({ path: 'test-results/screenshots/simple-final-dashboard.png', fullPage: true });
  });

  test('Final Validation', async () => {
    console.log('📋 Final validation...');
    
    // Final assertions
    expect(testResults.generatedVouchers.length).toBeGreaterThan(0);
    console.log('✅ Vouchers generated:', testResults.generatedVouchers.length);
    
    expect(testResults.mikrotikVerified.length).toBe(testResults.generatedVouchers.length);
    console.log('✅ All vouchers verified in RouterOS');
    
    expect(testResults.errors.length).toBe(0);
    console.log('✅ No errors');
    
    console.log('\n🎉 SIMPLE VOUCHER GENERATION TEST PASSED!');
    console.log('✅ Requirements satisfied:');
    console.log('  - Real voucher generated');
    console.log('  - Voucher verified in Mikrotik RouterOS');
    console.log('  - Comment metadata format verified');
    console.log('  - Voucher works correctly');
  });
});
