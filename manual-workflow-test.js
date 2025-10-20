/**
 * Manual Workflow Testing Script
 * This script helps perform complete manual testing workflow
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3005';
const MIKROTIK_CONFIG = {
  host: '54.37.252.142',
  user: 'admin',
  password: 'ganteng'
};

class ManualWorkflowTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testData = {
      profile: null,
      customer: null,
      vouchers: [],
      subscriptions: []
    };
  }

  async init() {
    console.log('🚀 Starting Manual Workflow Testing');
    console.log('=====================================');
    
    this.browser = await puppeteer.launch({ 
      headless: false,
      slowMo: 100,
      defaultViewport: { width: 1280, height: 720 }
    });
    
    this.page = await this.browser.newPage();
    
    if (!fs.existsSync('test-artifacts')) {
      fs.mkdirSync('test-artifacts');
    }
    
    console.log('✅ Browser initialized');
  }

  async takeScreenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = 'test-artifacts/manual-' + name + '-' + timestamp + '.png';
    await this.page.screenshot({ path: filename, fullPage: true });
    console.log('📸 Screenshot saved: ' + filename);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async login() {
    console.log('\n📋 Step 1: Admin Login');
    
    await this.page.goto(BASE_URL + '/login');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('01-login-page');

    await this.page.type('#username', 'admin');
    await this.page.type('#password', 'admin123');
    await this.takeScreenshot('02-login-filled');

    await this.page.click('button[type="submit"]');
    await this.page.waitForNavigation({ waitUntil: 'networkidle' });
    await this.takeScreenshot('03-login-success');

    console.log('✅ Admin login completed');
  }

  async createProfile() {
    console.log('\n📋 Step 2: Create Hotspot Profile');
    
    await this.page.goto(BASE_URL + '/profiles');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('04-profiles-page');

    // Look for add button
    try {
      await this.page.click('[data-testid="add-profile-btn"], .btn-primary:has-text("Tambah"), button:has-text("Tambah Profil"), a[href*="create"], .btn-success');
      await this.delay(1000);
    } catch (err) {
      console.log('⚠️ Add button not found, trying direct navigation');
      await this.page.goto(BASE_URL + '/profiles/create');
    }

    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('05-profile-form');

    const profileData = {
      name: 'Test-Hotspot-' + Date.now(),
      priceCost: '5000',
      priceSell: '10000',
      duration: '1h',
      rateLimit: '1M/2M'
    };

    // Fill form fields
    try {
      await this.page.type('#profile-name, input[name="name"]', profileData.name);
      await this.page.type('#price-cost, input[name="price_cost"]', profileData.priceCost);
      await this.page.type('#price-sell, input[name="price_sell"]', profileData.priceSell);
      await this.page.type('#duration, input[name="duration"]', profileData.duration);
      await this.page.type('#rate-limit, input[name="rate_limit"]', profileData.rateLimit);
      
      await this.takeScreenshot('06-profile-form-filled');

      // Submit form
      await this.page.click('button[type="submit"], .btn-success, button:has-text("Simpan")');
      await this.delay(2000);
      await this.takeScreenshot('07-profile-saved');

      this.testData.profile = profileData;
      console.log('✅ Profile created: ' + profileData.name);
      
    } catch (error) {
      console.log('❌ Profile creation failed: ' + error.message);
      await this.takeScreenshot('07-profile-error');
    }
  }

  async createCustomer() {
    console.log('\n📋 Step 3: Create Customer');
    
    await this.page.goto(BASE_URL + '/customers');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('08-customers-page');

    // Look for add button
    try {
      await this.page.click('[data-testid="add-customer-btn"], .btn-primary:has-text("Tambah"), button:has-text("Pelanggan Baru"), a[href*="create"], .btn-success');
      await this.delay(1000);
    } catch (err) {
      console.log('⚠️ Add button not found, checking if form already visible');
    }

    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('09-customer-form');

    const customerData = {
      name: 'Test Customer ' + Date.now(),
      email: 'test' + Date.now() + '@example.com',
      phone: '0812345678' + (Date.now().toString().slice(-4)),
      address: 'Test Address 123',
      notes: 'Manual test customer'
    };

    try {
      await this.page.type('#customer-name, input[name="name"]', customerData.name);
      await this.page.type('#customer-email, input[name="email"]', customerData.email);
      await this.page.type('#customer-phone, input[name="phone"]', customerData.phone);
      await this.page.type('#customer-address, textarea[name="address"]', customerData.address);
      await this.page.type('#customer-notes, textarea[name="notes"]', customerData.notes);
      
      await this.takeScreenshot('10-customer-form-filled');

      // Submit form
      await this.page.click('button[type="submit"], .btn-success, button:has-text("Simpan")');
      await this.delay(2000);
      await this.takeScreenshot('11-customer-saved');

      this.testData.customer = customerData;
      console.log('✅ Customer created: ' + customerData.name);
      
    } catch (error) {
      console.log('❌ Customer creation failed: ' + error.message);
      await this.takeScreenshot('11-customer-error');
    }
  }

  async generateVouchers() {
    console.log('\n📋 Step 4: Generate Vouchers');
    
    await this.page.goto(BASE_URL + '/vouchers');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('12-vouchers-page');

    // Look for generate button
    try {
      await this.page.click('[data-testid="generate-vouchers-btn"], .btn-primary:has-text("Generate"), button:has-text("Buat Voucher"), a[href*="generate"], .btn-success');
      await this.delay(1000);
    } catch (err) {
      console.log('⚠️ Generate button not found, checking if form already visible');
    }

    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('13-voucher-form');

    const voucherData = {
      profile: this.testData.profile ? this.testData.profile.name : 'Test-Hotspot',
      prefix: 'TEST',
      count: '3',
      notes: 'Manual test vouchers'
    };

    try {
      // Select profile if available
      if (this.testData.profile) {
        await this.page.select('#profile-select, select[name="profile"]', voucherData.profile);
      }
      
      await this.page.type('#prefix, input[name="prefix"]', voucherData.prefix);
      await this.page.type('#count, input[name="count"]', voucherData.count);
      await this.page.type('#notes, textarea[name="notes"]', voucherData.notes);
      
      await this.takeScreenshot('14-voucher-form-filled');

      // Generate vouchers
      await this.page.click('button[type="submit"], .btn-success, button:has-text("Buat"), button:has-text("Generate")');
      await this.delay(3000);
      await this.takeScreenshot('15-vouchers-generated');

      this.testData.vouchers.push(voucherData);
      console.log('✅ Vouchers generated: ' + voucherData.count + ' vouchers');
      
    } catch (error) {
      console.log('❌ Voucher generation failed: ' + error.message);
      await this.takeScreenshot('15-voucher-error');
    }
  }

  async createSubscription() {
    console.log('\n📋 Step 5: Create Subscription');
    
    await this.page.goto(BASE_URL + '/subscriptions');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('16-subscriptions-page');

    // Look for add button
    try {
      await this.page.click('[data-testid="add-subscription-btn"], .btn-primary:has-text("Tambah"), button:has-text("Buat Berlangganan"), a[href*="create"], .btn-success');
      await this.delay(1000);
    } catch (err) {
      console.log('⚠️ Add button not found, checking if form already visible');
    }

    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('17-subscription-form');

    const subscriptionData = {
      customer: this.testData.customer ? this.testData.customer.name : 'Test Customer',
      type: 'hotspot',
      profile: this.testData.profile ? this.testData.profile.name : 'Test-Hotspot',
      username: 'testuser' + Date.now(),
      password: 'pass' + (Date.now().toString().slice(-6)),
      notes: 'Manual test subscription'
    };

    try {
      // Select customer if available
      if (this.testData.customer) {
        await this.page.select('#customer-select, select[name="customer_id"]', subscriptionData.customer);
      }
      
      // Select subscription type
      await this.page.select('#subscription-type, select[name="type"]', subscriptionData.type);
      
      // Select profile if available
      if (this.testData.profile) {
        await this.page.select('#profile-select, select[name="profile_id"]', subscriptionData.profile);
      }
      
      await this.page.type('#username, input[name="username"]', subscriptionData.username);
      await this.page.type('#password, input[name="password"]', subscriptionData.password);
      await this.page.type('#notes, textarea[name="notes"]', subscriptionData.notes);
      
      await this.takeScreenshot('18-subscription-form-filled');

      // Create subscription
      await this.page.click('button[type="submit"], .btn-success, button:has-text("Simpan")');
      await this.delay(3000);
      await this.takeScreenshot('19-subscription-created');

      this.testData.subscriptions.push(subscriptionData);
      console.log('✅ Subscription created: ' + subscriptionData.username);
      
    } catch (error) {
      console.log('❌ Subscription creation failed: ' + error.message);
      await this.takeScreenshot('19-subscription-error');
    }
  }

  async verifyResults() {
    console.log('\n📋 Step 6: Verification and Summary');
    
    await this.page.goto(BASE_URL + '/dashboard');
    await this.page.waitForLoadState('networkidle');
    await this.takeScreenshot('20-final-dashboard');

    console.log('\n🎯 MANUAL WORKFLOW TEST SUMMARY');
    console.log('=====================================');
    
    if (this.testData.profile) {
      console.log('✅ Profile created: ' + this.testData.profile.name);
    } else {
      console.log('❌ Profile creation: FAILED');
    }
    
    if (this.testData.customer) {
      console.log('✅ Customer created: ' + this.testData.customer.name);
    } else {
      console.log('❌ Customer creation: FAILED');
    }
    
    if (this.testData.vouchers.length > 0) {
      console.log('✅ Vouchers generated: ' + this.testData.vouchers.length + ' sets');
    } else {
      console.log('❌ Voucher generation: FAILED');
    }
    
    if (this.testData.subscriptions.length > 0) {
      console.log('✅ Subscriptions created: ' + this.testData.subscriptions.length);
    } else {
      console.log('❌ Subscription creation: FAILED');
    }
    
    console.log('=====================================');
    
    // Save test results
    const testResults = {
      timestamp: new Date().toISOString(),
      baseURL: BASE_URL,
      mikrotikHost: MIKROTIK_CONFIG.host,
      testData: this.testData,
      status: 'COMPLETED',
      screenshotsDirectory: 'test-artifacts/',
      nextSteps: [
        'Verify profile creation in Mikrotik RouterOS',
        'Check voucher users in RouterOS',
        'Verify subscription users in RouterOS',
        'Test Mikrotik API connection manually',
        'Check database records for created data'
      ]
    };
    
    const resultsPath = path.join('test-artifacts', 'manual-workflow-results-' + Date.now() + '.json');
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    
    console.log('📄 Test results saved to: ' + resultsPath);
    console.log('📸 Screenshots saved to: test-artifacts/');
    
    console.log('\n🔧 MIKROTIK VERIFICATION STEPS:');
    console.log('1. Connect to RouterOS at ' + MIKROTIK_CONFIG.host);
    console.log('2. Check hotspot profiles: /ip hotspot user profile print');
    console.log('3. Check hotspot users: /ip hotspot user print');
    console.log('4. Check PPPoE secrets: /ppp secret print');
    console.log('5. Verify user comments contain system metadata');
    
    console.log('\n🚀 MANUAL WORKFLOW TESTING COMPLETED!');
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
  }

  async run() {
    try {
      await this.init();
      await this.login();
      await this.createProfile();
      await this.createCustomer();
      await this.generateVouchers();
      await this.createSubscription();
      await this.verifyResults();
    } catch (error) {
      console.error('💥 Workflow test failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the manual workflow test
if (require.main === module) {
  const tester = new ManualWorkflowTester();
  tester.run().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ManualWorkflowTester;
