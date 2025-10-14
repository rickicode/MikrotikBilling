const { test, expect } = require('@playwright/test');

/**
 * PostgreSQL Integration Tests for Mikrotik Billing System
 * Tests all major functionality with PostgreSQL database
 */

// Base URL for the application
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test credentials
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

test.describe('PostgreSQL Database Integration', () => {
  test.beforeAll(async () => {
    // Ensure the application is running
    console.log('🚀 Starting PostgreSQL integration tests...');
    console.log(`📡 Testing against: ${BASE_URL}`);
  });

  test.describe('Authentication', () => {
    test('should login with valid credentials', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      // Fill login form
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
      await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('should reject invalid credentials', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      // Fill with invalid credentials
      await page.fill('input[name="username"]', 'invalid');
      await page.fill('input[name="password"]', 'invalid');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('.alert-danger')).toBeVisible();
      await expect(page.locator('.alert-danger')).toContainText('Invalid credentials');
    });
  });

  test.describe('Customer Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login before each test
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should create a new customer', async ({ page }) => {
      // Go to customers page
      await page.click('a[href="/customers"]');
      await page.waitForURL(`${BASE_URL}/customers`);

      // Click create button
      await page.click('a[href="/customers/create"]');
      await page.waitForURL(`${BASE_URL}/customers/create`);

      // Fill customer form
      const testCustomer = {
        nama: 'Test Customer PostgreSQL',
        nomor_hp: '+628123456789',
        email: 'test.postgres@example.com',
        status_aktif: '1'
      };

      await page.fill('input[name="nama"]', testCustomer.nama);
      await page.fill('input[name="nomor_hp"]', testCustomer.nomor_hp);
      await page.fill('input[name="email"]', testCustomer.email);

      // Submit form
      await page.click('button[type="submit"]');

      // Should redirect to customers list with success message
      await page.waitForURL(`${BASE_URL}/customers`);
      await expect(page.locator('.alert-success')).toBeVisible();

      // Verify customer exists in database
      const response = await page.request.get(`${BASE_URL}/api/customers?search=Test Customer PostgreSQL`);
      const data = await response.json();
      expect(data.customers).toContainEqual(
        expect.objectContaining({
          nama: testCustomer.nama,
          nomor_hp: testCustomer.nomor_hp,
          email: testCustomer.email
        })
      );
    });

    test('should update customer information', async ({ page }) => {
      // Go to customers page
      await page.goto(`${BASE_URL}/customers`);

      // Find test customer and edit
      const customerRow = page.locator('table tbody tr').filter({ hasText: 'Test Customer PostgreSQL' }).first();
      await customerRow.locator('a[href*="/edit"]').click();

      // Update customer name
      const updatedName = 'Updated Customer PostgreSQL';
      await page.fill('input[name="nama"]', updatedName);
      await page.click('button[type="submit"]');

      // Verify update
      await expect(page.locator('.alert-success')).toBeVisible();

      // Check updated customer
      const response = await page.request.get(`${BASE_URL}/api/customers?search=${updatedName}`);
      const data = await response.json();
      expect(data.customers).toContainEqual(
        expect.objectContaining({
          nama: updatedName
        })
      );
    });

    test('should handle duplicate phone numbers', async ({ page }) => {
      // Try to create customer with existing phone
      await page.goto(`${BASE_URL}/customers/create`);

      await page.fill('input[name="nama"]', 'Duplicate Test');
      await page.fill('input[name="nomor_hp"]', '+628123456789'); // Already exists

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('.alert-danger')).toBeVisible();
      await expect(page.locator('.alert-danger')).toContainText('already registered');
    });
  });

  test.describe('Voucher Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should generate hotspot vouchers', async ({ page }) => {
      await page.goto(`${BASE_URL}/vouchers`);

      // Click create voucher
      await page.click('a[href="/vouchers/create"]');
      await page.waitForURL(`${BASE_URL}/vouchers/create`);

      // Fill voucher form
      await page.selectOption('select[name="profile_id"]', { label: '1-Hour' });
      await page.fill('input[name="prefix"]', 'TEST');
      await page.fill('input[name="count"]', '5');
      await page.fill('input[name="price_sell"]', '10000');

      // Generate vouchers
      await page.click('button[type="submit"]');

      // Should show success
      await expect(page.locator('.alert-success')).toBeVisible();

      // Check vouchers were created
      await page.goto(`${BASE_URL}/vouchers`);
      const voucherRows = page.locator('table tbody tr').filter({ hasText: 'TEST' });
      await expect(voucherRows).toHaveCount(5);
    });

    test('should search and filter vouchers', async ({ page }) => {
      await page.goto(`${BASE_URL}/vouchers`);

      // Search for test vouchers
      await page.fill('input[name="search"]', 'TEST');
      await page.click('button:has-text("Search")');

      // Should show filtered results
      const voucherRows = page.locator('table tbody tr').filter({ hasText: 'TEST' });
      await expect(voucherRows).toHaveCountGreaterThan(0);
    });
  });

  test.describe('PPPoE User Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should create PPPoE users', async ({ page }) => {
      await page.goto(`${BASE_URL}/pppoe/create`);

      // Fill PPPoE form
      await page.fill('input[name="username"]', 'testpppoe');
      await page.fill('input[name="password"]', 'testpass123');
      await page.selectOption('select[name="profile_id"]', { label: '10Mbps' });
      await page.selectOption('select[name="customer_id"]', { label: 'Updated Customer PostgreSQL' });

      // Create user
      await page.click('button[type="submit"]');

      // Should show success
      await expect(page.locator('.alert-success')).toBeVisible();

      // Verify user exists
      await page.goto(`${BASE_URL}/pppoe`);
      const userRow = page.locator('table tbody tr').filter({ hasText: 'testpppoe' });
      await expect(userRow).toHaveCount(1);
    });
  });

  test.describe('Profile Management', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should create and manage profiles', async ({ page }) => {
      await page.goto(`${BASE_URL}/profiles`);

      // Create new profile
      await page.click('a[href="/profiles/create"]');

      await page.selectOption('select[name="type"]', 'hotspot');
      await page.fill('input[name="name"]', 'Test Profile PostgreSQL');
      await page.fill('input[name="price_sell"]', '15000');
      await page.fill('input[name="duration"]', '2');
      await page.selectOption('select[name="duration_unit"]', 'hours');

      // Save profile
      await page.click('button[type="submit"]');

      // Should show success
      await expect(page.locator('.alert-success')).toBeVisible();

      // Verify profile exists
      await page.goto(`${BASE_URL}/profiles`);
      const profileRow = page.locator('table tbody tr').filter({ hasText: 'Test Profile PostgreSQL' });
      await expect(profileRow).toHaveCount(1);
    });
  });

  test.describe('Payment System', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should create payment links', async ({ page }) => {
      // Go to customer details
      await page.goto(`${BASE_URL}/customers`);
      await page.click('a:has-text("Updated Customer PostgreSQL")');

      // Create payment link
      await page.click('button:has-text("Create Payment Link")');

      // Fill payment details
      await page.fill('input[name="amount"]', '50000');
      await page.fill('input[name="description"]', 'Test Payment PostgreSQL');
      await page.selectOption('select[name="payment_method"]', 'manual');

      // Generate link
      await page.click('button:has-text("Generate Link")');

      // Should show payment link
      await expect(page.locator('.modal')).toBeVisible();
      await expect(page.locator('.modal')).toContainText('Payment Link Created');

      // Check payment link in database
      const response = await page.request.get(`${BASE_URL}/api/customers/Updated Customer PostgreSQL/payment-links`);
      const data = await response.json();
      expect(data.payment_links).toContainEqual(
        expect.objectContaining({
          amount: 50000,
          description: 'Test Payment PostgreSQL'
        })
      );
    });
  });

  test.describe('Dashboard Statistics', () => {
    test.beforeEach(async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);
    });

    test('should display correct statistics', async ({ page }) => {
      // Check statistics cards
      await expect(page.locator('.stat-card:has-text("Total Customers")')).toBeVisible();
      await expect(page.locator('.stat-card:has-text("Active Vouchers")')).toBeVisible();
      await expect(page.locator('.stat-card:has-text("PPPoE Users")')).toBeVisible();

      // Verify statistics API
      const response = await page.request.get(`${BASE_URL}/api/customers/statistics`);
      const stats = await response.json();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('hotspot');
      expect(stats).toHaveProperty('pppoe');

      // Should have at least one customer
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  test.describe('Database Consistency', () => {
    test('should maintain data consistency across operations', async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Create customer
      await page.goto(`${BASE_URL}/customers/create`);
      const customerData = {
        nama: 'Consistency Test',
        nomor_hp: '+628987654321',
        email: 'consistency@test.com'
      };

      await page.fill('input[name="nama"]', customerData.nama);
      await page.fill('input[name="nomor_hp"]', customerData.nomor_hp);
      await page.fill('input[name="email"]', customerData.email);
      await page.click('button[type="submit"]');

      // Verify customer exists
      const response = await page.request.get(`${BASE_URL}/api/customers?search=${customerData.nama}`);
      const data = await response.json();
      const customer = data.customers.find(c => c.nomor_hp === customerData.nomor_hp);
      expect(customer).toBeTruthy();

      // Update customer
      await page.goto(`${BASE_URL}/customers/${customer.id}/edit`);
      const updatedEmail = 'updated.consistency@test.com';
      await page.fill('input[name="email"]', updatedEmail);
      await page.click('button[type="submit"]');

      // Verify update persisted
      const updatedResponse = await page.request.get(`${BASE_URL}/api/customers/${customer.id}`);
      const updatedData = await updatedResponse.json();
      expect(updatedData.email).toBe(updatedEmail);
    });

    test('should handle concurrent operations', async ({ request }) => {
      // Create multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request.post(`${BASE_URL}/api/customers`, {
            data: {
              nama: `Concurrent Test ${i}`,
              nomor_hp: `+6281234567${i}0`,
              email: `concurrent${i}@test.com`,
              status_aktif: 1
            }
          })
        );
      }

      // Wait for all to complete
      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status()).toBe(201);
      });

      // Verify all customers exist
      const searchResponse = await request.get(`${BASE_URL}/api/customers?search=Concurrent Test`);
      const searchData = await searchResponse.json();
      expect(searchData.customers).toHaveLength(5);
    });
  });

  test.describe('Performance Tests', () => {
    test('should handle large datasets efficiently', async ({ page }) => {
      // Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[name="username"]', ADMIN_CREDENTIALS.username);
      await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${BASE_URL}/dashboard`);

      // Measure load time for customers page
      const startTime = Date.now();
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForSelector('table');
      const loadTime = Date.now() - startTime;

      // Should load within reasonable time
      expect(loadTime).toBeLessThan(2000);

      // Test pagination
      await page.selectOption('select[name="page_size"]', '50');
      await page.waitForTimeout(1000);

      // Should still be fast with more data
      const tableRows = await page.locator('table tbody tr').count();
      expect(tableRows).toBeGreaterThan(0);
    });
  });

  test.afterAll(async () => {
    console.log('✅ PostgreSQL integration tests completed!');
  });
});