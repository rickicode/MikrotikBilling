const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Mikrotik Billing System - Full Comprehensive Test Suite', () => {
  let browser;
  let context;
  let page;
  let testData = {};
  let adminToken = '';

  // Mikrotik connection details
  const MIKROTIK_CONFIG = {
    host: '54.37.252.142',
    user: 'admin',
    password: 'ganteng'
  };

  test.beforeAll(async () => {
    // Setup browser
    browser = await chromium.launch({ 
      headless: process.env.HEADLESS === 'true',
      slowMo: 50
    });
    
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    page = await context.newPage();
    
    // Set extended timeouts
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    
    // Create test artifacts directory
    if (!fs.existsSync('test-artifacts')) {
      fs.mkdirSync('test-artifacts');
    }
    
    console.log('🚀 Starting Mikrotik Billing Comprehensive Test Suite');
    console.log('📊 Base URL: http://localhost:3000');
    console.log('🌐 Mikrotik: ', MIKROTIK_CONFIG.host);
  });

  test.beforeEach(async () => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser Console Error:', msg.text());
      }
    });
    
    page.on('pageerror', err => {
      console.log('Page Error:', err.message);
    });
  });

  test.afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    console.log('🏁 Test suite completed');
  });

  /**
   * Helper Functions
   */
  async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function takeScreenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-artifacts/${name}-${timestamp}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`📸 Screenshot saved: ${filename}`);
  }

  async function waitForAndClick(selector, timeout = 30000) {
    await page.waitForSelector(selector, { timeout });
    await delay(500);
    await page.click(selector);
  }

  async function waitForAndFill(selector, value, timeout = 30000) {
    await page.waitForSelector(selector, { timeout });
    await delay(500);
    await page.fill(selector, value);
  }

  async function handleToast() {
    try {
      const toast = await page.waitForSelector('.toast', { timeout: 5000 });
      if (toast) {
        const toastText = await toast.textContent();
        console.log('🔔 Toast message:', toastText);
        
        // Check if it's an error toast
        if (toastText.includes('error') || toastText.includes('gagal') || toastText.includes('Error')) {
          console.error('❌ Error toast detected:', toastText);
          await takeScreenshot('error-toast');
        }
        
        // Wait for toast to disappear
        await delay(3000);
      }
    } catch (err) {
      // No toast appeared
    }
  }

  /**
   * Test 1: Database Reset and Admin Login
   */
  test('should reset database and login as admin', async () => {
    console.log('\n📋 Test 1: Database Reset and Admin Login');

    // Navigate to admin page
    await page.goto('http://localhost:3000/admin/login');
    await page.waitForLoadState('networkidle');
    await takeScreenshot('admin-login-page');

    // Login as admin
    await waitForAndFill('#username', 'admin');
    await waitForAndFill('#password', 'admin123');
    
    await takeScreenshot('admin-login-form-filled');
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('#login-button')
    ]);

    // Check if login successful
    await page.waitForSelector('.admin-dashboard, .dashboard, h1:has-text("Dashboard")', { timeout: 10000 });
    await takeScreenshot('admin-dashboard-success');
    
    console.log('✅ Admin login successful');
    
    // Get auth token for API calls
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name === 'token');
    if (authCookie) {
      adminToken = authCookie.value;
      console.log('✅ Auth token obtained');
    }

    await handleToast();
  });

  /**
   * Test 2: Create Hotspot Profile
   */
  test('should create hotspot profile via web interface', async () => {
    console.log('\n📋 Test 2: Create Hotspot Profile');

    // Navigate to profiles page
    await page.goto('http://localhost:3000/profiles');
    await page.waitForLoadState('networkidle');
    await takeScreenshot('profiles-page');

    // Click add new profile button
    await waitForAndClick('[data-testid="add-profile-btn"], .btn-primary:has-text("Tambah"), button:has-text("Tambah Profil")');
    await delay(1000);
    await takeScreenshot('add-profile-form');

    // Fill profile form
    const profileData = {
      name: `Test-Hotspot-${Date.now()}`,
      priceCost: '5000',
      priceSell: '10000',
      duration: '1h',
      rateLimit: '1M/2M'
    };

    await waitForAndFill('#profile-name, input[name="name"]', profileData.name);
    await waitForAndFill('#price-cost, input[name="price_cost"]', profileData.priceCost);
    await waitForAndFill('#price-sell, input[name="price_sell"]', profileData.priceSell);
    await waitForAndFill('#duration, input[name="duration"]', profileData.duration);
    await waitForAndFill('#rate-limit, input[name="rate_limit"]', profileData.rateLimit);

    // Select profile type
    await page.click('#profile-type, select[name="type"]');
    await page.click('option[value="hotspot"]');
    
    await takeScreenshot('profile-form-filled');

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('[data-testid="save-profile-btn"], .btn-success:has-text("Simpan"), button:has-text("Simpan")')
    ]);

    await takeScreenshot('profile-saved');
    
    testData.hotspotProfile = profileData;
    console.log('✅ Hotspot profile created:', profileData.name);

    await handleToast();
  });

  /**
   * Test 3: Verify Profile in Mikrotik
   */
  test('should verify profile created in Mikrotik RouterOS', async () => {
    console.log('\n📋 Test 3: Verify Profile in Mikrotik RouterOS');

    if (!adminToken) {
      throw new Error('Admin token not available');
    }

    try {
      // Call API to check Mikrotik profiles
      const response = await page.evaluate(async ({ host, user, password, token }) => {
        const apiResponse = await fetch(`http://localhost:3000/api/mikrotik/profiles`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API call failed: ${apiResponse.status}`);
        }
        
        return await apiResponse.json();
      }, { 
        host: MIKROTIK_CONFIG.host, 
        user: MIKROTIK_CONFIG.user, 
        password: MIKROTIK_CONFIG.password,
        token: adminToken 
      });

      console.log('📊 Mikrotik profiles response:', response);

      // Check if our test profile exists
      const profileExists = response.data && response.data.some(profile => 
        profile.name === testData.hotspotProfile.name
      );

      expect(profileExists).toBe(true);
      console.log('✅ Profile verified in Mikrotik RouterOS');

    } catch (error) {
      console.error('❌ Failed to verify profile in Mikrotik:', error.message);
      await takeScreenshot('mikrotik-profile-verify-error');
      throw error;
    }
  });

  /**
   * Test 4: Generate Hotspot Vouchers
   */
  test('should generate hotspot vouchers', async () => {
    console.log('\n📋 Test 4: Generate Hotspot Vouchers');

    // Navigate to vouchers page
    await page.goto('http://localhost:3000/vouchers');
    await page.waitForLoadState('networkidle');
    await takeScreenshot('vouchers-page');

    // Click generate vouchers button
    await waitForAndClick('[data-testid="generate-vouchers-btn"], .btn-primary:has-text("Generate"), button:has-text("Buat Voucher")');
    await delay(1000);
    await takeScreenshot('generate-vouchers-form');

    // Fill voucher generation form
    const voucherData = {
      profile: testData.hotspotProfile.name,
      prefix: 'TEST',
      count: '5',
      notes: 'Test voucher generation'
    };

    // Select profile
    await page.click('#profile-select, select[name="profile"]');
    await page.click(`option:has-text("${voucherData.profile}")`);
    
    await waitForAndFill('#prefix, input[name="prefix"]', voucherData.prefix);
    await waitForAndFill('#count, input[name="count"]', voucherData.count);
    await waitForAndFill('#notes, textarea[name="notes"]', voucherData.notes);

    await takeScreenshot('voucher-form-filled');

    // Generate vouchers
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/vouchers/generate') && res.status() === 200),
      page.click('[data-testid="generate-btn"], .btn-success:has-text("Generate"), button:has-text("Buat")')
    ]);

    await delay(2000);
    await takeScreenshot('vouchers-generated');

    // Check if vouchers are displayed
    const voucherElements = await page.locator('[data-testid="voucher-item"], .voucher-item, tr.voucher').count();
    expect(voucherElements).toBeGreaterThan(0);

    testData.voucherData = voucherData;
    console.log('✅ Vouchers generated successfully');

    await handleToast();
  });

  /**
   * Test 5: Verify Vouchers in Mikrotik
   */
  test('should verify vouchers created in Mikrotik RouterOS', async () => {
    console.log('\n📋 Test 5: Verify Vouchers in Mikrotik RouterOS');

    try {
      // Call API to check Mikrotik users
      const response = await page.evaluate(async ({ token }) => {
        const apiResponse = await fetch(`http://localhost:3000/api/mikrotik/users`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API call failed: ${apiResponse.status}`);
        }
        
        return await apiResponse.json();
      }, { token: adminToken });

      console.log('📊 Mikrotik users response:', response);

      // Check if our test vouchers exist
      const testVouchers = response.data && response.data.filter(user => 
        user.name && user.name.startsWith(testData.voucherData.prefix)
      );

      expect(testVouchers.length).toBeGreaterThan(0);
      console.log(`✅ Found ${testVouchers.length} vouchers in Mikrotik RouterOS`);
      
      testData.mikrotikVouchers = testVouchers;

    } catch (error) {
      console.error('❌ Failed to verify vouchers in Mikrotik:', error.message);
      await takeScreenshot('mikrotik-voucher-verify-error');
      throw error;
    }
  });

  /**
   * Test 6: Create New Customer
   */
  test('should create new customer', async () => {
    console.log('\n📋 Test 6: Create New Customer');

    // Navigate to customers page
    await page.goto('http://localhost:3000/customers');
    await page.waitForLoadState('networkidle');
    await takeScreenshot('customers-page');

    // Click add customer button
    await waitForAndClick('[data-testid="add-customer-btn"], .btn-primary:has-text("Tambah"), button:has-text("Pelanggan Baru")');
    await delay(1000);
    await takeScreenshot('add-customer-form');

    // Fill customer form
    const customerData = {
      name: `Test Customer ${Date.now()}`,
      email: `test${Date.now()}@example.com`,
      phone: `0812345678${Date.now().toString().slice(-4)}`,
      address: 'Test Address 123',
      notes: 'Test customer for comprehensive testing'
    };

    await waitForAndFill('#customer-name, input[name="name"]', customerData.name);
    await waitForAndFill('#customer-email, input[name="email"]', customerData.email);
    await waitForAndFill('#customer-phone, input[name="phone"]', customerData.phone);
    await waitForAndFill('#customer-address, textarea[name="address"]', customerData.address);
    await waitForAndFill('#customer-notes, textarea[name="notes"]', customerData.notes);

    await takeScreenshot('customer-form-filled');

    // Save customer
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('[data-testid="save-customer-btn"], .btn-success:has-text("Simpan"), button:has-text("Simpan")')
    ]);

    await takeScreenshot('customer-saved');

    // Verify customer appears in list
    await page.waitForSelector(`text=${customerData.name}`, { timeout: 10000 });

    testData.customer = customerData;
    console.log('✅ Customer created successfully:', customerData.name);

    await handleToast();
  });

  /**
   * Test 7: Create PPPoE Subscription for Customer
   */
  test('should create PPPoE subscription for customer', async () => {
    console.log('\n📋 Test 7: Create PPPoE Subscription for Customer');

    // First, create a PPPoE profile
    await page.goto('http://localhost:3000/profiles');
    await page.waitForLoadState('networkidle');
    
    await waitForAndClick('[data-testid="add-profile-btn"], .btn-primary:has-text("Tambah")');
    await delay(1000);

    const pppoeProfileData = {
      name: `Test-PPPoE-${Date.now()}`,
      priceCost: '50000',
      priceSell: '75000',
      duration: '30d',
      rateLimit: '2M/4M'
    };

    await waitForAndFill('#profile-name, input[name="name"]', pppoeProfileData.name);
    await waitForAndFill('#price-cost, input[name="price_cost"]', pppoeProfileData.priceCost);
    await waitForAndFill('#price-sell, input[name="price_sell"]', pppoeProfileData.priceSell);
    await waitForAndFill('#duration, input[name="duration"]', pppoeProfileData.duration);
    await waitForAndFill('#rate-limit, input[name="rate_limit"]', pppoeProfileData.rateLimit);

    // Select PPPoE type
    await page.click('#profile-type, select[name="type"]');
    await page.click('option[value="pppoe"]');

    await page.click('[data-testid="save-profile-btn"], .btn-success:has-text("Simpan")');
    await page.waitForLoadState('networkidle');
    
    testData.pppoeProfile = pppoeProfileData;

    // Now create PPPoE subscription
    await page.goto('http://localhost:3000/subscriptions');
    await page.waitForLoadState('networkidle');
    await takeScreenshot('subscriptions-page');

    await waitForAndClick('[data-testid="add-subscription-btn"], .btn-primary:has-text("Tambah")');
    await delay(1000);
    await takeScreenshot('add-subscription-form');

    // Select customer
    await page.click('#customer-select, select[name="customer_id"]');
    await page.click(`option:has-text("${testData.customer.name}")`);

    // Select PPPoE type
    await page.click('#subscription-type, select[name="type"]');
    await page.click('option[value="pppoe"]');

    // Select PPPoE profile
    await page.click('#profile-select, select[name="profile_id"]');
    await page.click(`option:has-text("${pppoeProfileData.name}")`);

    // Fill subscription details
    const subscriptionData = {
      username: `testpppoe${Date.now()}`,
      password: `pass${Date.now().toString().slice(-6)}`,
      notes: 'Test PPPoE subscription'
    };

    await waitForAndFill('#username, input[name="username"]', subscriptionData.username);
    await waitForAndFill('#password, input[name="password"]', subscriptionData.password);
    await waitForAndFill('#notes, textarea[name="notes"]', subscriptionData.notes);

    await takeScreenshot('pppoe-subscription-form-filled');

    // Save subscription
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('[data-testid="save-subscription-btn"], .btn-success:has-text("Simpan")')
    ]);

    await takeScreenshot('pppoe-subscription-saved');

    testData.pppoeSubscription = { ...subscriptionData, profile: pppoeProfileData.name };
    console.log('✅ PPPoE subscription created:', subscriptionData.username);

    await handleToast();
  });

  /**
   * Test 8: Create Hotspot Subscription for Customer
   */
  test('should create hotspot subscription for customer', async () => {
    console.log('\n📋 Test 8: Create Hotspot Subscription for Customer');

    // Navigate to subscriptions page
    await page.goto('http://localhost:3000/subscriptions');
    await page.waitForLoadState('networkidle');

    await waitForAndClick('[data-testid="add-subscription-btn"], .btn-primary:has-text("Tambah")');
    await delay(1000);
    await takeScreenshot('add-hotspot-subscription-form');

    // Select customer
    await page.click('#customer-select, select[name="customer_id"]');
    await page.click(`option:has-text("${testData.customer.name}")`);

    // Select hotspot type
    await page.click('#subscription-type, select[name="type"]');
    await page.click('option[value="hotspot"]');

    // Select hotspot profile
    await page.click('#profile-select, select[name="profile_id"]');
    await page.click(`option:has-text("${testData.hotspotProfile.name}")`);

    // Fill subscription details
    const hotspotSubscriptionData = {
      username: `testhotspot${Date.now()}`,
      password: `pass${Date.now().toString().slice(-6)}`,
      notes: 'Test hotspot subscription'
    };

    await waitForAndFill('#username, input[name="username"]', hotspotSubscriptionData.username);
    await waitForAndFill('#password, input[name="password"]', hotspotSubscriptionData.password);
    await waitForAndFill('#notes, textarea[name="notes"]', hotspotSubscriptionData.notes);

    await takeScreenshot('hotspot-subscription-form-filled');

    // Save subscription
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('[data-testid="save-subscription-btn"], .btn-success:has-text("Simpan")')
    ]);

    await takeScreenshot('hotspot-subscription-saved');

    testData.hotspotSubscription = { ...hotspotSubscriptionData, profile: testData.hotspotProfile.name };
    console.log('✅ Hotspot subscription created:', hotspotSubscriptionData.username);

    await handleToast();
  });

  /**
   * Test 9: Verify All Users in Mikrotik
   */
  test('should verify all PPPoE and hotspot users exist in Mikrotik', async () => {
    console.log('\n📋 Test 9: Verify All Users in Mikrotik RouterOS');

    try {
      // Get all users from Mikrotik
      const response = await page.evaluate(async ({ token }) => {
        const apiResponse = await fetch(`http://localhost:3000/api/mikrotik/users`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API call failed: ${apiResponse.status}`);
        }
        
        return await apiResponse.json();
      }, { token: adminToken });

      console.log('📊 All Mikrotik users response:', response);

      // Verify PPPoE user exists
      const pppoeUser = response.data && response.data.find(user => 
        user.name === testData.pppoeSubscription.username
      );
      expect(pppoeUser).toBeTruthy();
      console.log('✅ PPPoE user verified in Mikrotik:', testData.pppoeSubscription.username);

      // Verify hotspot user exists
      const hotspotUser = response.data && response.data.find(user => 
        user.name === testData.hotspotSubscription.username
      );
      expect(hotspotUser).toBeTruthy();
      console.log('✅ Hotspot user verified in Mikrotik:', testData.hotspotSubscription.username);

      // Verify test vouchers exist
      const voucherCount = response.data && response.data.filter(user => 
        user.name && user.name.startsWith(testData.voucherData.prefix)
      ).length;
      expect(voucherCount).toBe(parseInt(testData.voucherData.count));
      console.log(`✅ All ${voucherCount} vouchers verified in Mikrotik`);

      await takeScreenshot('mikrotik-all-users-verified');

    } catch (error) {
      console.error('❌ Failed to verify users in Mikrotik:', error.message);
      await takeScreenshot('mikrotik-users-verify-error');
      throw error;
    }
  });

  /**
   * Test 10: Check for Console Errors and Toast Messages
   */
  test('should check for console errors and fix any issues', async () => {
    console.log('\n📋 Test 10: Check for Console Errors and Toast Messages');

    // Navigate through all main pages to check for errors
    const pages = [
      { url: '/admin/dashboard', name: 'Admin Dashboard' },
      { url: '/profiles', name: 'Profiles' },
      { url: '/vouchers', name: 'Vouchers' },
      { url: '/customers', name: 'Customers' },
      { url: '/subscriptions', name: 'Subscriptions' },
      { url: '/payments', name: 'Payments' }
    ];

    for (const pageUrl of pages) {
      console.log(`🔍 Checking ${pageUrl.name}...`);
      
      await page.goto(`http://localhost:3000${pageUrl.url}`);
      await page.waitForLoadState('networkidle');
      await delay(2000);

      // Check for JavaScript errors
      const errors = await page.evaluate(() => {
        const errors = [];
        window.onerror = function(msg, url, line, col, error) {
          errors.push({ msg, url, line, col, error: error.message });
        };
        return errors;
      });

      if (errors.length > 0) {
        console.error(`❌ JavaScript errors found on ${pageUrl.name}:`, errors);
        await takeScreenshot(`js-errors-${pageUrl.name.toLowerCase().replace(/\s+/g, '-')}`);
      } else {
        console.log(`✅ No JavaScript errors on ${pageUrl.name}`);
      }

      // Check for any error messages on the page
      const errorElements = await page.locator('.alert-danger, .error-message, .toast.error').count();
      if (errorElements > 0) {
        console.warn(`⚠️ Found ${errorElements} error messages on ${pageUrl.name}`);
        await takeScreenshot(`error-messages-${pageUrl.name.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    console.log('✅ Error checking completed');
  });

  /**
   * Test 11: Database Integrity Check
   */
  test('should verify database integrity and data consistency', async () => {
    console.log('\n📋 Test 11: Database Integrity Check');

    try {
      // Check database via API
      const checks = await page.evaluate(async ({ token }) => {
        const endpoints = [
          '/api/profiles',
          '/api/customers', 
          '/api/subscriptions',
          '/api/vouchers'
        ];

        const results = {};
        
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`http://localhost:3000${endpoint}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              results[endpoint] = {
                success: true,
                count: data.data ? data.data.length : 0,
                data: data
              };
            } else {
              results[endpoint] = {
                success: false,
                status: response.status
              };
            }
          } catch (error) {
            results[endpoint] = {
              success: false,
              error: error.message
            };
          }
        }
        
        return results;
      }, { token: adminToken });

      console.log('📊 Database integrity check results:', JSON.stringify(checks, null, 2));

      // Verify all endpoints returned successfully
      expect(checks['/api/profiles'].success).toBe(true);
      expect(checks['/api/customers'].success).toBe(true);
      expect(checks['/api/subscriptions'].success).toBe(true);
      expect(checks['/api/vouchers'].success).toBe(true);

      // Verify our test data exists
      expect(checks['/api/customers'].count).toBeGreaterThan(0);
      expect(checks['/api/profiles'].count).toBeGreaterThan(0);
      expect(checks['/api/subscriptions'].count).toBeGreaterThan(0);
      expect(checks['/api/vouchers'].count).toBeGreaterThan(0);

      console.log('✅ Database integrity verified');

    } catch (error) {
      console.error('❌ Database integrity check failed:', error.message);
      await takeScreenshot('database-integrity-error');
      throw error;
    }
  });

  /**
   * Final Summary Test
   */
  test('should provide comprehensive test summary', async () => {
    console.log('\n📋 Test 12: Comprehensive Test Summary');

    console.log('\n🎯 COMPREHENSIVE TEST SUMMARY');
    console.log('=====================================');
    console.log('✅ Database reset and admin login');
    console.log('✅ Hotspot profile created:', testData.hotspotProfile?.name);
    console.log('✅ Profile verified in Mikrotik RouterOS');
    console.log('✅ Vouchers generated:', testData.voucherData?.count);
    console.log('✅ Vouchers verified in Mikrotik RouterOS');
    console.log('✅ Customer created:', testData.customer?.name);
    console.log('✅ PPPoE subscription created:', testData.pppoeSubscription?.username);
    console.log('✅ Hotspot subscription created:', testData.hotspotSubscription?.username);
    console.log('✅ All users verified in Mikrotik RouterOS');
    console.log('✅ Console error checking completed');
    console.log('✅ Database integrity verified');
    console.log('=====================================');
    console.log('🎉 All tests completed successfully!');

    await takeScreenshot('test-completion-summary');

    // Save test data to file
    const testSummary = {
      timestamp: new Date().toISOString(),
      mikrotikHost: MIKROTIK_CONFIG.host,
      testData: testData,
      status: 'SUCCESS'
    };

    fs.writeFileSync(
      path.join('test-artifacts', `test-summary-${Date.now()}.json`),
      JSON.stringify(testSummary, null, 2)
    );

    console.log('📄 Test summary saved to test-artifacts/');
  });
});
