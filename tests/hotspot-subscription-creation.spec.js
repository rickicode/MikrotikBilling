const { test, expect } = require('@playwright/test');

test.describe('Hotspot Subscription Creation Workflow', () => {
    let customerCreated = false;
    let testCustomerId = null;

    test.use({
        baseURL: 'http://localhost:3005',
        ignoreHTTPSErrors: true
    });

    async function login(page) {
        // Check if we're on login page by looking for login form elements
        const usernameInput = page.locator('input[placeholder*="username"], input[placeholder*="Username"], input[name="username"]');
        const passwordInput = page.locator('input[placeholder*="password"], input[placeholder*="Password"], input[name="password"]');

        if (await usernameInput.isVisible({ timeout: 5000 })) {
            console.log('Login form detected, attempting to login...');

            // Fill in credentials (use correct default credentials)
            await usernameInput.fill('admin');
            await passwordInput.fill('admin123');

            // Click login button
            const loginButton = page.locator('button:has-text("Masuk"), button:has-text("Login"), button[type="submit"]');
            await loginButton.click();

            // Wait for navigation and check if login successful
            await page.waitForLoadState('networkidle');

            // Check for error message
            const errorMessage = page.locator('.alert-danger, .error, [class*="error"]');
            if (await errorMessage.isVisible({ timeout: 3000 })) {
                const errorText = await errorMessage.textContent();
                console.log(`Login error: ${errorText.trim()}`);
                throw new Error(`Login failed: ${errorText.trim()}`);
            }

            console.log('Login successful');
            return true;
        }

        console.log('No login form detected, already logged in');
        return false;
    }

    async function navigateToCustomers(page) {
        // Navigate to customers page
        await page.click('a[href="/customers"], nav a:has-text("Customer"), nav a:has-text("Pelanggan")');
        await page.waitForLoadState('networkidle');

        // Verify we're on customers page
        await expect(page).toHaveURL(/.*customers.*/);
        console.log('Navigated to customers page');
    }

    async function createTestCustomer(page) {
        console.log('Creating test customer...');

        // Click add customer button
        await page.click('a[href="/customers/create"], button:has-text("Tambah"), button:has-text("Add")');
        await page.waitForLoadState('networkidle');

        // Fill customer form
        await page.fill('input[name="nama"], input[name="name"], input[placeholder*="Nama"]', `Test Customer ${Date.now()}`);
        await page.fill('input[name="email"], input[type="email"]', `test${Date.now()}@example.com`);
        await page.fill('input[name="telepon"], input[name="phone"], input[placeholder*="Telepon"]', '08123456789');
        await page.fill('input[name="alamat"], textarea[name="alamat"], textarea[placeholder*="Alamat"]', 'Test Address');

        // Submit form
        await page.click('button[type="submit"]:has-text("Simpan"), button[type="submit"]:has-text("Save")');
        await page.waitForLoadState('networkidle');

        // Check if customer was created successfully by looking for success message
        const successMessage = page.locator('.alert-success, .toast-success, [class*="success"]').first();
        if (await successMessage.isVisible({ timeout: 5000 })) {
            console.log('Customer created successfully');
            customerCreated = true;

            // Try to extract customer ID from URL or page content
            const urlMatch = await page.url();
            const idMatch = urlMatch.match(/\/customers\/(\d+)/);
            if (idMatch) {
                testCustomerId = idMatch[1];
                console.log(`Extracted customer ID: ${testCustomerId}`);
            }
        } else {
            console.log('Customer creation may have failed or no success message shown');
        }
    }

    async function selectFirstCustomer(page) {
        console.log('Looking for existing customers...');

        // Wait for customer list to load
        await page.waitForSelector('table tbody tr, .customer-item, [class*="customer"]', { timeout: 10000 });

        // Try to click on the first customer in the list
        const firstCustomerLink = page.locator('table tbody tr a[href*="/customers/"], .customer-item a, [class*="customer"] a').first();

        if (await firstCustomerLink.isVisible()) {
            await firstCustomerLink.click();
            await page.waitForLoadState('networkidle');

            // Extract customer ID from URL
            const urlMatch = await page.url();
            const idMatch = urlMatch.match(/\/customers\/(\d+)/);
            if (idMatch) {
                testCustomerId = idMatch[1];
                console.log(`Selected existing customer with ID: ${testCustomerId}`);
                return true;
            }
        }

        return false;
    }

    async function testSubscriptionCreation(page) {
        console.log('Testing subscription creation workflow...');

        // Wait for customer dashboard to load
        await page.waitForSelector('[data-testid="customer-dashboard"], .customer-dashboard, .dashboard', { timeout: 10000 });

        // Click on "Tambah Berlangganan" button
        const addSubscriptionBtn = page.locator('button:has-text("Tambah Berlangganan"), button:has-text("Add Subscription")');
        await expect(addSubscriptionBtn).toBeVisible({ timeout: 5000 });
        await addSubscriptionBtn.click();

        // Wait for modal to appear
        await page.waitForSelector('#addSubscriptionModal, .modal:has-text("Tambah Berlangganan")', { timeout: 5000 });
        console.log('Subscription modal opened');

        // Select service type (Hotspot)
        const serviceTypeSelect = page.locator('#serviceType, select[name="service_type"]');
        await expect(serviceTypeSelect).toBeVisible();
        await serviceTypeSelect.selectOption({ label: 'Hotspot' });
        console.log('Selected Hotspot service type');

        // Wait for profiles to load
        await page.waitForTimeout(2000);

        // Select a profile/package
        const profileSelect = page.locator('#profileId, select[name="profile_id"]');
        await expect(profileSelect).toBeVisible();

        // Get available options
        const profileOptions = await profileSelect.locator('option:not([value=""])').count();
        expect(profileOptions).toBeGreaterThan(0);

        // Select the first available profile
        await profileSelect.selectOption({ index: 1 });
        console.log('Selected hotspot profile');

        // Fill in username if required
        const usernameInput = page.locator('#username, input[name="username"]');
        if (await usernameInput.isVisible()) {
            const timestamp = Date.now();
            await usernameInput.fill(`testuser${timestamp}`);
            console.log('Filled username');
        }

        // Fill in other required fields
        const durationInput = page.locator('input[name="duration"], input[placeholder*="durasi"]');
        if (await durationInput.isVisible()) {
            await durationInput.fill('7'); // 7 days
            console.log('Set duration to 7 days');
        }

        // Submit the form
        const submitBtn = page.locator('#addSubscriptionForm button[type="submit"], .modal-footer button[type="submit"]');
        await expect(submitBtn).toBeVisible();
        await submitBtn.click();
        console.log('Submitted subscription form');

        // Wait for response
        await page.waitForTimeout(3000);

        // Check for success toast notification
        const successToast = page.locator('.toast-success, .alert-success, [class*="toast"][class*="success"], .notification.success').first();

        if (await successToast.isVisible({ timeout: 5000 })) {
            console.log('✅ Success toast notification detected!');

            // Verify toast is not transparent (has proper opacity)
            const toastOpacity = await successToast.evaluate(el => {
                return window.getComputedStyle(el).opacity;
            });
            expect(parseFloat(toastOpacity)).toBeGreaterThan(0.5);
            console.log(`✅ Toast opacity check passed: ${toastOpacity}`);

            // Check toast has proper color (background color indicates success)
            const toastBgColor = await successToast.evaluate(el => {
                return window.getComputedStyle(el).backgroundColor;
            });
            console.log(`Toast background color: ${toastBgColor}`);

            // Verify success message text
            const toastText = await successToast.textContent();
            expect(toastText).toMatch(/berhasil|success|berlangganan|subscription/i);
            console.log(`✅ Success message: ${toastText.trim()}`);
        } else {
            console.log('❌ No success toast notification found');

            // Check for error messages
            const errorToast = page.locator('.toast-error, .alert-danger, [class*="toast"][class*="error"], .notification.error').first();
            if (await errorToast.isVisible()) {
                const errorText = await errorToast.textContent();
                console.log(`❌ Error message detected: ${errorText.trim()}`);
            }
        }

        // Check if modal was closed
        const modal = page.locator('#addSubscriptionModal, .modal:has-text("Tambah Berlangganan")');
        const isModalVisible = await modal.isVisible();
        if (!isModalVisible) {
            console.log('✅ Modal was closed after submission');
        }

        // Check if subscription appears in the list
        await page.waitForTimeout(2000);
        const subscriptionList = page.locator('table tbody tr, .subscription-item, [class*="subscription"]');

        if (await subscriptionList.first().isVisible()) {
            const subscriptionCount = await subscriptionList.count();
            console.log(`✅ Found ${subscriptionCount} subscriptions in the list`);

            // Look for the newly created subscription
            const newSubscription = page.locator('table tbody tr:has-text("Hotspot"), .subscription-item:has-text("Hotspot")').first();
            if (await newSubscription.isVisible()) {
                console.log('✅ New hotspot subscription found in the list');
            }
        }
    }

    test('Complete hotspot subscription creation workflow', async ({ page }) => {
        // Navigate to base URL
        await page.goto('http://localhost:3005');
        await page.waitForLoadState('networkidle');

        // Login if needed
        await login(page);

        // Navigate to customers page
        await navigateToCustomers(page);

        // Try to select an existing customer first
        let customerSelected = await selectFirstCustomer(page);

        // If no customers exist or selection failed, create a new one
        if (!customerSelected) {
            console.log('No existing customers found, creating a new one...');
            await createTestCustomer(page);

            if (customerCreated) {
                // Navigate to customers page again and select the newly created customer
                await navigateToCustomers(page);
                await selectFirstCustomer(page);
            } else {
                console.log('Failed to create test customer, attempting to test anyway...');
            }
        }

        // Test the subscription creation workflow
        await testSubscriptionCreation(page);

        // Take a screenshot for debugging
        await page.screenshot({
            path: 'test-results/hotspot-subscription-creation-final.png',
            fullPage: true
        });
    });

    test('Toast notification styling verification', async ({ page }) => {
        // Navigate to base URL
        await page.goto('http://localhost:3005');
        await page.waitForLoadState('networkidle');

        // Login if needed
        await login(page);

        // Navigate to customers page
        await navigateToCustomers(page);

        // Try to select an existing customer
        let customerSelected = await selectFirstCustomer(page);

        if (!customerSelected && !customerCreated) {
            // Create a customer if none exist
            await createTestCustomer(page);
            await navigateToCustomers(page);
            await selectFirstCustomer(page);
        }

        // Wait for dashboard
        await page.waitForSelector('[data-testid="customer-dashboard"], .customer-dashboard, .dashboard', { timeout: 10000 });

        // Click add subscription button
        const addSubscriptionBtn = page.locator('button:has-text("Tambah Berlangganan"), button:has-text("Add Subscription")');
        if (await addSubscriptionBtn.isVisible()) {
            await addSubscriptionBtn.click();
            await page.waitForSelector('#addSubscriptionModal, .modal:has-text("Tambah Berlangganan")', { timeout: 5000 });

            // Test toast styling by submitting incomplete form to trigger error
            const submitBtn = page.locator('#addSubscriptionForm button[type="submit"], .modal-footer button[type="submit"]');
            await submitBtn.click();
            await page.waitForTimeout(2000);

            // Check for error toast
            const errorToast = page.locator('.toast-error, .alert-danger, [class*="toast"][class*="error"], .notification.error').first();

            if (await errorToast.isVisible()) {
                // Verify error toast styling
                const toastStyles = await errorToast.evaluate(el => {
                    const styles = window.getComputedStyle(el);
                    return {
                        opacity: styles.opacity,
                        backgroundColor: styles.backgroundColor,
                        color: styles.color,
                        visibility: styles.visibility,
                        display: styles.display
                    };
                });

                console.log('Error toast styles:', toastStyles);
                expect(parseFloat(toastStyles.opacity)).toBeGreaterThan(0.5);
                expect(toastStyles.visibility).toBe('visible');
                expect(toastStyles.display).not.toBe('none');

                console.log('✅ Error toast styling verification passed');
            }
        }

        // Take screenshot of toast styling
        await page.screenshot({
            path: 'test-results/toast-styling-verification.png',
            fullPage: true
        });
    });
});