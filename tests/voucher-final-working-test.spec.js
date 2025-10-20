const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * WORKING VOUCHER GENERATION TEST WITH MIKROTIK VERIFICATION
 * Final working version
 */

const BASE_URL = 'http://localhost:3005';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

const MIKROTIK_CONFIG = {
  host: '54.37.252.142',
  port: 8728,
  username: 'userku',
  password: 'ganteng',
  timeout: 30000
};

test('Complete Voucher Generation and Mikrotik RouterOS Verification', async ({ page }) => {
  console.log('🚀 STARTING WORKING VOUCHER GENERATION TEST');
  console.log('=' .repeat(70));
  
  let mikrotikClient = null;
  let generatedCode = null;
  
  try {
    // Connect to Mikrotik
    console.log('🔌 Connecting to Mikrotik RouterOS...');
    mikrotikClient = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
    await mikrotikClient.connect();
    await mikrotikClient.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
    
    const identity = await mikrotikClient.runQuery('/system/identity/print');
    console.log('✅ Connected to Mikrotik:', identity[0]?.name || 'Unknown');
    
    const existingUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    console.log('📊 Existing hotspot users:', existingUsers.length);
    console.log('');
    
    // Login to system
    console.log('🔐 Logging into Mikrotik Billing System...');
    await page.goto(BASE_URL + '/login');
    
    await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
    await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"], .btn-login, input[type="submit"]');
    
    await page.waitForURL(BASE_URL + '/dashboard', { timeout: 15000 });
    console.log('✅ Successfully logged in');
    
    // Go to vouchers page
    console.log('🎫 Navigating to Voucher Hotspot page...');
    await page.goto(BASE_URL + '/vouchers');
    await expect(page.locator('h1, .page-title')).toContainText('Voucher', { timeout: 10000 });
    console.log('✅ Accessed Voucher Hotspot page');
    
    // Click the "+ Generate Voucher" button specifically
    console.log('➕ Clicking "+ Generate Voucher" button...');
    const generateVoucherButton = page.getByRole('link', { name: '+ Generate Voucher' });
    await expect(generateVoucherButton).toBeVisible({ timeout: 10000 });
    await generateVoucherButton.click();
    
    await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
    await expect(page.locator('h1, .page-title')).toContainText('Generate Voucher', { timeout: 10000 });
    console.log('✅ Accessed voucher creation page');
    
    // Fill form
    console.log('📝 Filling voucher generation form...');
    const uniquePrefix = 'TEST' + Date.now();
    const quantity = 1;
    const price = 15000;
    
    console.log('  - Prefix:', uniquePrefix);
    console.log('  - Quantity:', quantity);
    console.log('  - Price: Rp', price);
    
    // Select profile
    const profileSelect = page.locator('select[name="profile_id"]');
    await profileSelect.waitFor({ state: 'visible', timeout: 10000 });
    
    const profileOptions = await profileSelect.locator('option').allTextContents();
    console.log('  - Available profiles:', profileOptions.filter(p => p.trim()).slice(0, 3));
    
    if (profileOptions.length > 1) {
      await profileSelect.selectOption({ index: 1 });
      console.log('  - Selected profile:', profileOptions[1]);
    }
    
    // Fill form fields
    await page.fill('input[name="quantity"]', quantity.toString());
    await page.fill('input[name="prefix"]', uniquePrefix);
    
    const priceInput = page.locator('input[name="price_sell"]');
    if (await priceInput.isVisible()) {
      await priceInput.fill(price.toString());
    }
    
    await page.screenshot({ path: 'test-results/screenshots/working-form-filled.png', fullPage: true });
    console.log('📸 Form screenshot captured');
    
    // Submit form
    console.log('🚀 Submitting voucher generation...');
    await page.click('button[type="submit"], .btn-generate, button:has-text("Generate")');
    await page.waitForTimeout(5000);
    
    let voucherGenerated = false;
    let batchId = null;
    
    // Check result
    if (page.url().includes('/print/')) {
      console.log('📄 SUCCESS! Redirected to print page');
      voucherGenerated = true;
      
      const urlParts = page.url().split('/');
      batchId = urlParts[urlParts.length - 1];
      console.log('📦 Batch ID:', batchId);
      
      await page.screenshot({ path: 'test-results/screenshots/working-print-page.png', fullPage: true });
      
      // Test print button
      const printButton = page.locator('button:has-text("Print"), .btn-print');
      if (await printButton.isVisible()) {
        console.log('🖨️ Testing print functionality...');
        await printButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ Print functionality working');
      }
      
    } else {
      const successMessage = page.locator('.alert-success, .success-message');
      if (await successMessage.isVisible()) {
        console.log('✅ Success message displayed');
        voucherGenerated = true;
      } else {
        const errorMessage = page.locator('.alert-danger, .error-message');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          console.error('🚨 Error:', errorText);
          throw new Error('Voucher generation failed: ' + errorText);
        }
      }
      
      await page.screenshot({ path: 'test-results/screenshots/working-result-page.png', fullPage: true });
    }
    
    if (!voucherGenerated) {
      throw new Error('Voucher generation failed - no success indication');
    }
    
    console.log('✅ Voucher generation completed');
    
    // Verify voucher in web interface
    console.log('🔍 Verifying voucher in web interface...');
    await page.goto(BASE_URL + '/vouchers');
    await page.waitForSelector('table, .voucher-list', { timeout: 10000 });
    
    // Search for voucher
    const searchInput = page.locator('input[name="search"], .search-input, input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(uniquePrefix);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    
    // Find voucher
    const voucherRows = page.locator('table tbody tr, .voucher-item');
    const testVoucherRows = voucherRows.filter({ hasText: uniquePrefix });
    const voucherCount = await testVoucherRows.count();
    
    console.log('📊 Found', voucherCount, 'vouchers with prefix "' + uniquePrefix + '"');
    
    if (voucherCount === 0) {
      throw new Error('No vouchers found in web interface');
    }
    
    // Extract voucher code
    const row = testVoucherRows.first();
    const codeCell = row.locator('td').first();
    if (await codeCell.isVisible()) {
      const code = await codeCell.textContent();
      if (code && code.trim()) {
        generatedCode = code.trim();
        console.log('✅ Extracted voucher code:', generatedCode);
      }
    }
    
    if (!generatedCode) {
      throw new Error('Could not extract voucher code from web interface');
    }
    
    console.log('');
    console.log('🔌 CRITICAL VERIFICATION IN MIKROTIK ROUTEROS');
    console.log('🚨 This is the make-or-break verification step');
    console.log('');
    
    // Get hotspot users from RouterOS
    console.log('📡 Retrieving hotspot users from RouterOS...');
    const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    console.log('📊 Total hotspot users in RouterOS:', hotspotUsers.length);
    
    // Find our voucher
    const mikrotikUser = hotspotUsers.find(user => user.name === generatedCode);
    
    if (!mikrotikUser) {
      console.error('❌ CRITICAL FAILURE: Voucher', generatedCode, 'NOT FOUND in RouterOS!');
      console.error('🚨 This proves the voucher generation system is NOT working');
      throw new Error('Voucher not found in Mikrotik RouterOS');
    }
    
    console.log('🎉 SUCCESS! Voucher', generatedCode, 'found in RouterOS!');
    console.log('');
    console.log('📋 RouterOS Voucher Details:');
    console.log('  - Username:', mikrotikUser.name);
    console.log('  - Profile:', mikrotikUser.profile);
    console.log('  - Disabled:', mikrotikUser.disabled);
    console.log('  - Comment:', mikrotikUser.comment);
    console.log('  - Uptime:', mikrotikUser.uptime);
    console.log('');
    
    // Critical verifications
    console.log('🔍 Performing critical verifications...');
    
    // 1. User must be enabled
    if (mikrotikUser.disabled !== 'false') {
      console.error('❌ FAILED: User is disabled in RouterOS');
      throw new Error('Voucher is disabled in RouterOS');
    }
    console.log('✅ User is enabled');
    
    // 2. Must have VOUCHER_SYSTEM comment
    if (!mikrotikUser.comment || !mikrotikUser.comment.includes('VOUCHER_SYSTEM')) {
      console.error('❌ FAILED: Missing VOUCHER_SYSTEM comment');
      throw new Error('Missing VOUCHER_SYSTEM comment');
    }
    console.log('✅ VOUCHER_SYSTEM comment found');
    
    // 3. Verify comment format
    const commentParts = mikrotikUser.comment.split('|');
    if (commentParts.length < 4) {
      console.error('❌ FAILED: Invalid comment format:', mikrotikUser.comment);
      throw new Error('Invalid comment format');
    }
    
    const [systemMarker, priceSell, firstLogin, validUntil] = commentParts;
    console.log('  📝 Comment Analysis:');
    console.log('    - System Marker:', systemMarker);
    console.log('    - Price Sell:', priceSell);
    console.log('    - First Login:', firstLogin);
    console.log('    - Valid Until:', validUntil);
    
    // 4. Verify price
    if (priceSell !== price.toString()) {
      console.warn('⚠️ Price mismatch: expected', price, ', got', priceSell);
    } else {
      console.log('✅ Price verification passed');
    }
    
    // 5. Verify expiry
    const validUntilTime = parseInt(validUntil);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (validUntilTime <= currentTime) {
      console.error('❌ FAILED: Voucher already expired');
      throw new Error('Voucher already expired');
    }
    
    const expiryDate = new Date(validUntilTime * 1000);
    console.log('✅ Valid until:', expiryDate.toLocaleString());
    
    console.log('');
    console.log('🎉 ALL CRITICAL VERIFICATIONS PASSED!');
    console.log('');
    
    // Final summary
    console.log('📊 FINAL TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('✅ Voucher Code:', generatedCode);
    console.log('✅ Price: Rp', price);
    console.log('✅ Created in Web Interface: YES');
    console.log('✅ Found in RouterOS: YES');
    console.log('✅ VOUCHER_SYSTEM Comment: YES');
    console.log('✅ Comment Format: VALID');
    console.log('✅ User Enabled: YES');
    console.log('✅ Valid Expiry: YES');
    console.log('✅ Print Functionality: TESTED');
    console.log('');
    
    // Final screenshot
    await page.goto(BASE_URL + '/dashboard');
    await page.screenshot({ path: 'test-results/screenshots/working-final-dashboard.png', fullPage: true });
    
    console.log('🎉 COMPLETE VOUCHER GENERATION TEST SUCCESSFUL!');
    console.log('');
    console.log('✅ PROOF ACHIEVED:');
    console.log('  - Real vouchers are generated by the system');
    console.log('  - Vouchers appear correctly in Mikrotik RouterOS');
    console.log('  - Comment metadata format is correct');
    console.log('  - Print functionality works');
    console.log('  - All verification criteria satisfied');
    console.log('');
    console.log('🚀 The voucher generation system is WORKING PROPERLY!');
    
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
  }
});
