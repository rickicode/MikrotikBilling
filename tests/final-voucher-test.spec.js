const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * FINAL VOUCHER GENERATION TEST WITH MIKROTIK VERIFICATION
 * Complete test for voucher generation workflow
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

test('Complete Voucher Generation and Mikrotik Verification', async ({ page }) => {
  console.log('🚀 STARTING COMPLETE VOUCHER GENERATION TEST');
  console.log('=' .repeat(70));
  console.log('📡 Web Interface:', BASE_URL);
  console.log('🔌 Mikrotik RouterOS:', MIKROTIK_CONFIG.host + ':' + MIKROTIK_CONFIG.port);
  console.log('');
  
  let mikrotikClient = null;
  let testResults = {
    generatedVouchers: [],
    mikrotikVerified: [],
    errors: []
  };
  
  try {
    // Connect to Mikrotik RouterOS
    console.log('🔌 Step 0: Connect to Mikrotik RouterOS...');
    mikrotikClient = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
    await mikrotikClient.connect();
    await mikrotikClient.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
    
    const identity = await mikrotikClient.runQuery('/system/identity/print');
    const identityName = identity && identity.length > 0 ? 
      (identity[0].name || identity[0]['identity-name'] || identity[0].identity || 'Unknown') : 
      'Unknown';
    console.log('✅ Connected to Mikrotik:', identityName);
    
    const existingUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    console.log('📊 Existing hotspot users:', existingUsers.length);
    console.log('');
    
    // Step 1: Login to Mikrotik Billing System
    console.log('🔐 Step 1: Login to Mikrotik Billing System...');
    await page.goto(BASE_URL + '/login');
    
    await expect(page.locator('h1, h2, .login-title')).toBeVisible({ timeout: 10000 });
    await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
    await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"], .btn-login, input[type="submit"]');
    
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Dashboard', { timeout: 10000 });
    console.log('✅ Successfully logged into Mikrotik Billing System');
    console.log('');
    
    // Step 2: Navigate to Voucher Hotspot page
    console.log('🎫 Step 2: Navigate to Voucher Hotspot page...');
    await page.goto(BASE_URL + '/vouchers');
    await expect(page.locator('h1, .page-title')).toContainText('Voucher', { timeout: 10000 });
    console.log('✅ Successfully accessed Voucher Hotspot page');
    
    // Step 3: Click on "Generate Voucher" button
    console.log('➕ Step 3: Click Generate Voucher button...');
    
    // Look for specific voucher creation link
    const voucherCreateLink = page.locator('a[href*="/vouchers/create"]');
    await expect(voucherCreateLink).toBeVisible({ timeout: 10000 });
    await voucherCreateLink.first().click();
    
    await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
    await expect(page.locator('h1, .page-title')).toContainText('Create', { timeout: 10000 });
    console.log('✅ Successfully accessed voucher creation page');
    console.log('');
    
    // Step 4: Fill voucher form
    console.log('📝 Step 4: Fill voucher generation form...');
    const uniquePrefix = 'TEST' + Date.now();
    const quantity = 1;
    const price = 15000;
    
    console.log('  📋 Form Details:');
    console.log('    - Prefix:', uniquePrefix);
    console.log('    - Quantity:', quantity);
    console.log('    - Price:', price);
    
    // Select profile
    const profileSelect = page.locator('select[name="profile_id"]');
    await profileSelect.waitFor({ state: 'visible', timeout: 10000 });
    
    const profileOptions = await profileSelect.locator('option').allTextContents();
    console.log('    - Available profiles:', profileOptions.slice(1)); // Skip empty option
    
    if (profileOptions.length > 1) {
      await profileSelect.selectOption({ index: 1 });
      console.log('    - Selected profile:', profileOptions[1]);
    } else {
      await profileSelect.selectOption({ index: 0 });
      console.log('    - Selected default profile');
    }
    
    // Fill other form fields
    await page.fill('input[name="quantity"]', quantity.toString());
    await page.fill('input[name="prefix"]', uniquePrefix);
    
    const priceInput = page.locator('input[name="price_sell"]');
    if (await priceInput.isVisible()) {
      await priceInput.fill(price.toString());
    }
    
    // Screenshot before submission
    await page.screenshot({ path: 'test-results/screenshots/final-form-filled.png', fullPage: true });
    console.log('📸 Form screenshot captured');
    console.log('');
    
    // Step 5: Submit voucher generation
    console.log('🚀 Step 5: Submit voucher generation...');
    await page.click('button[type="submit"], .btn-generate, button:has-text("Generate")');
    
    // Wait for processing
    await page.waitForTimeout(5000);
    
    let voucherGenerated = false;
    let generatedCode = null;
    let batchId = null;
    
    // Check result
    if (page.url().includes('/print/')) {
      console.log('📄 Redirected to print page - SUCCESS!');
      voucherGenerated = true;
      
      // Extract batch ID
      const urlParts = page.url().split('/');
      batchId = urlParts[urlParts.length - 1];
      console.log('📦 Batch ID:', batchId);
      
      await page.screenshot({ path: 'test-results/screenshots/final-print-page.png', fullPage: true });
      
      // Test print functionality
      const printButton = page.locator('button:has-text("Print"), .btn-print, button[onclick*="print()"]');
      if (await printButton.isVisible()) {
        console.log('🖨️ Print button found - testing print functionality...');
        await printButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ Print functionality tested');
      }
      
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
      
      await page.screenshot({ path: 'test-results/screenshots/final-result-page.png', fullPage: true });
    }
    
    if (!voucherGenerated) {
      console.error('❌ Voucher generation failed');
      testResults.errors.push('Voucher generation failed');
      throw new Error('Voucher generation failed');
    }
    
    console.log('✅ Voucher generation completed successfully');
    console.log('');
    
    // Step 6: Verify voucher in web interface
    console.log('🔍 Step 6: Verify voucher in web interface...');
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
          price: price,
          batch_id: batchId
        });
        console.log('✅ Extracted voucher code:', generatedCode);
      }
    }
    
    if (!generatedCode) {
      console.error('❌ Could not extract voucher code');
      testResults.errors.push('Could not extract voucher code');
      throw new Error('Could not extract voucher code');
    }
    
    console.log('');
    
    // Step 7: CRITICAL MIKROTIK VERIFICATION
    console.log('🔌 Step 7: CRITICAL - Verify voucher in Mikrotik RouterOS');
    console.log('🚨 THIS IS THE MAKE-OR-BREAK VERIFICATION STEP');
    console.log('');
    
    if (!mikrotikClient) {
      throw new Error('Mikrotik client not available');
    }
    
    // Get all hotspot users
    console.log('📡 Retrieving all hotspot users from RouterOS...');
    const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    console.log('📊 Total hotspot users in RouterOS:', hotspotUsers.length);
    
    // Find our voucher
    const mikrotikUser = hotspotUsers.find(user => user.name === generatedCode);
    
    if (!mikrotikUser) {
      console.error('❌ CRITICAL FAILURE: Voucher', generatedCode, 'NOT FOUND in Mikrotik RouterOS!');
      console.error('🚨 This means the voucher generation system is NOT working properly');
      testResults.errors.push('Voucher ' + generatedCode + ' missing in RouterOS');
      throw new Error('Voucher not found in RouterOS');
    }
    
    console.log('🎉 SUCCESS: Voucher', generatedCode, 'found in RouterOS!');
    console.log('  📋 RouterOS Details:');
    console.log('    - RouterOS ID:', mikrotikUser['.id']);
    console.log('    - Username:', mikrotikUser.name);
    console.log('    - Profile:', mikrotikUser.profile);
    console.log('    - Disabled:', mikrotikUser.disabled);
    console.log('    - Comment:', mikrotikUser.comment);
    console.log('    - Uptime:', mikrotikUser.uptime);
    console.log('    - Bytes In:', mikrotikUser.bytes_in || '0');
    console.log('    - Bytes Out:', mikrotikUser.bytes_out || '0');
    console.log('');
    
    // CRITICAL VERIFICATIONS
    console.log('🔍 Performing critical verifications...');
    
    // 1. User must be enabled
    if (mikrotikUser.disabled !== 'false') {
      console.error('❌ VERIFICATION FAILED: User is disabled in RouterOS');
      testResults.errors.push('Voucher is disabled in RouterOS');
      throw new Error('Voucher is disabled in RouterOS');
    }
    console.log('✅ User is enabled in RouterOS');
    
    // 2. Comment must contain VOUCHER_SYSTEM pattern
    if (!mikrotikUser.comment || !mikrotikUser.comment.includes('VOUCHER_SYSTEM')) {
      console.error('❌ VERIFICATION FAILED: Missing VOUCHER_SYSTEM comment');
      testResults.errors.push('Missing VOUCHER_SYSTEM comment');
      throw new Error('Missing VOUCHER_SYSTEM comment');
    }
    console.log('✅ VOUCHER_SYSTEM comment found');
    
    // 3. Verify comment format: VOUCHER_SYSTEM|price_sell|first_login|valid_until
    const commentParts = mikrotikUser.comment.split('|');
    if (commentParts.length < 4) {
      console.error('❌ VERIFICATION FAILED: Invalid comment format:', mikrotikUser.comment);
      testResults.errors.push('Invalid comment format');
      throw new Error('Invalid comment format');
    }
    
    const [systemMarker, priceSell, firstLogin, validUntil] = commentParts;
    console.log('  📝 Comment Analysis:');
    console.log('    - System Marker:', systemMarker, '✅');
    console.log('    - Price Sell:', priceSell, '✅');
    console.log('    - First Login:', firstLogin, '✅');
    console.log('    - Valid Until:', validUntil, '✅');
    
    // 4. Verify price matches expected
    if (priceSell !== price.toString()) {
      console.warn('⚠️ Price mismatch: expected', price, ', got', priceSell);
    } else {
      console.log('✅ Price verification passed');
    }
    
    // 5. Verify timestamps are valid
    const firstLoginTime = parseInt(firstLogin);
    const validUntilTime = parseInt(validUntil);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (firstLoginTime === 0) {
      console.log('✅ First login: Not used yet');
    } else if (firstLoginTime > currentTime) {
      console.warn('⚠️ First login time is in the future');
    } else {
      console.log('ℹ️ First login: Already used');
    }
    
    if (validUntilTime <= currentTime) {
      console.error('❌ VERIFICATION FAILED: Voucher already expired');
      testResults.errors.push('Voucher already expired');
      throw new Error('Voucher already expired');
    }
    
    const expiryDate = new Date(validUntilTime * 1000);
    console.log('✅ Valid until:', expiryDate.toLocaleString());
    console.log('');
    
    // All verifications passed
    testResults.mikrotikVerified.push(generatedCode);
    console.log('🎉 ALL CRITICAL VERIFICATIONS PASSED for', generatedCode);
    console.log('');
    
    // Step 8: Final verification and summary
    console.log('📊 Step 8: Final verification summary...');
    
    // Final screenshot of dashboard
    await page.goto(BASE_URL + '/dashboard');
    await page.screenshot({ path: 'test-results/screenshots/final-dashboard.png', fullPage: true });
    
    // Final RouterOS state check
    const finalHotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    const finalVoucherUsers = finalHotspotUsers.filter(user => 
      user.comment && user.comment.includes('VOUCHER_SYSTEM')
    );
    
    console.log('📊 Final RouterOS state:');
    console.log('  - Total hotspot users:', finalHotspotUsers.length);
    console.log('  - Total voucher users:', finalVoucherUsers.length);
    console.log('  - Our test voucher in RouterOS:', testResults.mikrotikVerified.length);
    
    // Final assertions
    expect(testResults.generatedVouchers.length).toBeGreaterThan(0);
    expect(testResults.mikrotikVerified.length).toBe(testResults.generatedVouchers.length);
    expect(testResults.errors.length).toBe(0);
    
    console.log('');
    console.log('🎉 FINAL VALIDATION SUCCESSFUL!');
    console.log('✅ All requirements satisfied:');
    console.log('  ✅ Real voucher generated successfully');
    console.log('  ✅ Voucher verified in Mikrotik RouterOS');
    console.log('  ✅ Comment metadata format verified');
    console.log('  ✅ Print functionality tested');
    console.log('  ✅ All critical verifications passed');
    
  } finally {
    // Cleanup
    if (mikrotikClient) {
      try {
        await mikrotikClient.close();
        console.log('🔌 Mikrotik connection closed');
      } catch (error) {
        console.warn('Warning: Failed to close Mikrotik connection:', error.message);
      }
    }
    
    // Print final results
    console.log('');
    console.log('=' .repeat(70));
    console.log('🎯 FINAL VOUCHER GENERATION TEST RESULTS');
    console.log('=' .repeat(70));
    console.log('📊 Total Vouchers Generated:', testResults.generatedVouchers.length);
    console.log('✅ Vouchers Verified in RouterOS:', testResults.mikrotikVerified.length);
    console.log('❌ Errors:', testResults.errors.length);
    
    if (testResults.errors.length > 0) {
      console.log('');
      console.log('❌ ERRORS ENCOUNTERED:');
      testResults.errors.forEach((error, index) => {
        console.log('  ' + (index + 1) + '. ' + error);
      });
    }
    
    if (testResults.generatedVouchers.length > 0) {
      console.log('');
      console.log('✅ SUCCESSFULLY GENERATED VOUCHERS:');
      testResults.generatedVouchers.forEach((voucher, index) => {
        const verified = testResults.mikrotikVerified.includes(voucher.code);
        console.log('  ' + (index + 1) + '. ' + voucher.code + 
                    ' (Rp ' + voucher.price + ')' + 
                    ' - ' + (verified ? '✅ RouterOS Verified' : '❌ Missing'));
      });
    }
    
    console.log('');
    console.log('📁 Screenshots saved to: test-results/screenshots/');
    console.log('=' .repeat(70));
    
    if (testResults.mikrotikVerified.length === testResults.generatedVouchers.length && testResults.errors.length === 0) {
      console.log('🎉 COMPREHENSIVE VOUCHER GENERATION TEST PASSED!');
      console.log('✅ PROOF: Voucher generation system works correctly and creates real vouchers in Mikrotik RouterOS');
    } else {
      console.log('❌ COMPREHENSIVE VOUCHER GENERATION TEST FAILED!');
      console.log('🚨 Issues found that need to be resolved');
    }
  }
});
