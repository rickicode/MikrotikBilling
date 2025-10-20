const { test, expect } = require('@playwright/test');
const { RouterOSClient } = require('mikro-routeros');

/**
 * SIMPLE FINAL VOUCHER GENERATION TEST
 * Focus on the core voucher generation and Mikrotik verification
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

test('Voucher Generation and Mikrotik RouterOS Verification', async ({ page }) => {
  console.log('🚀 VOUCHER GENERATION TEST STARTED');
  console.log('=' .repeat(50));
  
  let mikrotikClient = null;
  let generatedCode = null;
  
  // Step 1: Login
  console.log('🔐 Step 1: Login to system');
  await page.goto(BASE_URL + '/login');
  await page.fill('input[name="username"], input[type="text"], #username', ADMIN_CREDENTIALS.username);
  await page.fill('input[name="password"], input[type="password"], #password', ADMIN_CREDENTIALS.password);
  await page.click('button[type="submit"], .btn-login, input[type="submit"]');
  
  // Wait for login success - check for dashboard OR stay on current page if redirected elsewhere
  await page.waitForTimeout(3000);
  const currentUrl = page.url();
  console.log('📍 Current URL after login:', currentUrl);
  
  if (currentUrl.includes('/login')) {
    // Login failed - check for error message
    const errorMessage = page.locator('.alert-danger, .error-message');
    if (await errorMessage.isVisible()) {
      const errorText = await errorMessage.textContent();
      console.error('❌ Login error:', errorText);
      throw new Error('Login failed: ' + errorText);
    }
    throw new Error('Login failed - no error message visible');
  }
  
  console.log('✅ Login successful');
  
  // Step 2: Go to vouchers page
  console.log('🎫 Step 2: Navigate to vouchers');
  await page.goto(BASE_URL + '/vouchers');
  await expect(page.locator('h1, .page-title')).toContainText('Voucher', { timeout: 10000 });
  console.log('✅ On vouchers page');
  
  // Step 3: Click generate voucher button
  console.log('➕ Step 3: Click generate voucher');
  const generateButton = page.getByRole('link', { name: '+ Generate Voucher' });
  await expect(generateButton).toBeVisible({ timeout: 10000 });
  await generateButton.click();
  
  await page.waitForURL(BASE_URL + '/vouchers/create', { timeout: 15000 });
  console.log('✅ On voucher creation page');
  
  // Step 4: Fill form
  console.log('📝 Step 4: Fill voucher form');
  const uniquePrefix = 'TEST' + Date.now();
  const quantity = 1;
  const price = 15000;
  
  console.log('  - Prefix:', uniquePrefix);
  console.log('  - Quantity:', quantity);
  console.log('  - Price:', price);
  
  // Select profile
  const profileSelect = page.locator('select[name="profile_id"]');
  await profileSelect.waitFor({ state: 'visible', timeout: 10000 });
  
  const profileOptions = await profileSelect.locator('option').allTextContents();
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
  
  // Step 5: Submit form
  console.log('🚀 Step 5: Submit voucher generation');
  await page.click('button[type="submit"], .btn-generate');
  await page.waitForTimeout(5000);
  
  let voucherGenerated = false;
  let batchId = null;
  
  // Check result
  if (page.url().includes('/print/')) {
    console.log('📄 Redirected to print page - SUCCESS!');
    voucherGenerated = true;
    
    const urlParts = page.url().split('/');
    batchId = urlParts[urlParts.length - 1];
    console.log('📦 Batch ID:', batchId);
    
    await page.screenshot({ path: 'test-results/screenshots/simple-print-page.png', fullPage: true });
    
  } else {
    const successMessage = page.locator('.alert-success, .success-message');
    if (await successMessage.isVisible()) {
      console.log('✅ Success message shown');
      voucherGenerated = true;
    } else {
      const errorMessage = page.locator('.alert-danger, .error-message');
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent();
        console.error('🚨 Generation error:', errorText);
        throw new Error('Voucher generation failed: ' + errorText);
      }
    }
    
    await page.screenshot({ path: 'test-results/screenshots/simple-result-page.png', fullPage: true });
  }
  
  if (!voucherGenerated) {
    throw new Error('Voucher generation failed - no success indication');
  }
  
  console.log('✅ Voucher generated successfully');
  
  // Step 6: Find voucher in web interface
  console.log('🔍 Step 6: Find voucher in web interface');
  await page.goto(BASE_URL + '/vouchers');
  await page.waitForSelector('table, .voucher-list', { timeout: 10000 });
  
  // Search for voucher
  const searchInput = page.locator('input[name="search"], .search-input, input[placeholder*="Search"]');
  if (await searchInput.isVisible()) {
    await searchInput.fill(uniquePrefix);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }
  
  // Extract voucher code
  const voucherRows = page.locator('table tbody tr, .voucher-item');
  const testVoucherRows = voucherRows.filter({ hasText: uniquePrefix });
  const voucherCount = await testVoucherRows.count();
  
  console.log('📊 Found', voucherCount, 'vouchers with prefix "' + uniquePrefix + '"');
  
  if (voucherCount === 0) {
    throw new Error('No vouchers found in web interface');
  }
  
  const row = testVoucherRows.first();
  const codeCell = row.locator('td').first();
  if (await codeCell.isVisible()) {
    const code = await codeCell.textContent();
    if (code && code.trim()) {
      generatedCode = code.trim();
      console.log('✅ Voucher code:', generatedCode);
    }
  }
  
  if (!generatedCode) {
    throw new Error('Could not extract voucher code');
  }
  
  // Step 7: Connect to Mikrotik and verify
  console.log('');
  console.log('🔌 Step 7: CRITICAL - Verify in Mikrotik RouterOS');
  
  try {
    console.log('📡 Connecting to Mikrotik RouterOS...');
    mikrotikClient = new RouterOSClient(MIKROTIK_CONFIG.host, MIKROTIK_CONFIG.port, MIKROTIK_CONFIG.timeout);
    await mikrotikClient.connect();
    await mikrotikClient.login(MIKROTIK_CONFIG.username, MIKROTIK_CONFIG.password);
    
    const identity = await mikrotikClient.runQuery('/system/identity/print');
    console.log('✅ Connected to Mikrotik:', identity[0]?.name || 'Unknown');
    
    // Get hotspot users
    const hotspotUsers = await mikrotikClient.runQuery('/ip/hotspot/user/print');
    console.log('📊 Total hotspot users:', hotspotUsers.length);
    
    // Find our voucher
    const mikrotikUser = hotspotUsers.find(user => user.name === generatedCode);
    
    if (!mikrotikUser) {
      console.error('❌ CRITICAL: Voucher', generatedCode, 'NOT FOUND in RouterOS!');
      throw new Error('Voucher not found in Mikrotik RouterOS');
    }
    
    console.log('🎉 SUCCESS! Voucher found in RouterOS');
    console.log('  - Username:', mikrotikUser.name);
    console.log('  - Profile:', mikrotikUser.profile);
    console.log('  - Disabled:', mikrotikUser.disabled);
    console.log('  - Comment:', mikrotikUser.comment);
    
    // Verify critical properties
    if (mikrotikUser.disabled !== 'false') {
      throw new Error('Voucher is disabled in RouterOS');
    }
    
    if (!mikrotikUser.comment || !mikrotikUser.comment.includes('VOUCHER_SYSTEM')) {
      throw new Error('Missing VOUCHER_SYSTEM comment');
    }
    
    const commentParts = mikrotikUser.comment.split('|');
    if (commentParts.length < 4) {
      throw new Error('Invalid comment format: ' + mikrotikUser.comment);
    }
    
    const [systemMarker, priceSell, firstLogin, validUntil] = commentParts;
    console.log('  📝 Comment parts:', systemMarker, '|', priceSell, '|', firstLogin, '|', validUntil);
    
    // Verify price
    if (priceSell !== price.toString()) {
      console.warn('⚠️ Price mismatch: expected', price, ', got', priceSell);
    }
    
    // Verify expiry
    const validUntilTime = parseInt(validUntil);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (validUntilTime <= currentTime) {
      throw new Error('Voucher already expired');
    }
    
    const expiryDate = new Date(validUntilTime * 1000);
    console.log('  ✅ Valid until:', expiryDate.toLocaleString());
    
    console.log('');
    console.log('🎉 ALL VERIFICATIONS PASSED!');
    console.log('');
    console.log('📊 TEST RESULTS:');
    console.log('  ✅ Voucher Generated:', generatedCode);
    console.log('  ✅ Found in Web Interface: YES');
    console.log('  ✅ Found in RouterOS: YES');
    console.log('  ✅ VOUCHER_SYSTEM Comment: YES');
    console.log('  ✅ User Enabled: YES');
    console.log('  ✅ Valid Expiry: YES');
    console.log('');
    console.log('🚀 VOUCHER GENERATION SYSTEM WORKING PROPERLY!');
    
  } finally {
    if (mikrotikClient) {
      try {
        await mikrotikClient.close();
        console.log('🔌 Mikrotik connection closed');
      } catch (error) {
        console.warn('Warning: Failed to close Mikrotik connection');
      }
    }
  }
});
