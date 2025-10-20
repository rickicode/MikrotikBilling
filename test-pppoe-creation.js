const { chromium } = require('playwright');

async function testPPPoEUserCreation() {
    console.log('🚀 Starting PPPoE User Creation Test...');
    
    const browser = await chromium.launch({ headless: false, slowMo: 1000 });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Step 1: Access the application
        console.log('📍 Step 1: Accessing Mikrotik Billing System...');
        await page.goto('http://localhost:3006');
        
        // Check if redirected to login or dashboard
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // If redirected to dashboard, we're logged in
        if (currentUrl.includes('/dashboard')) {
            console.log('✅ Already logged in, proceeding to dashboard...');
        } else if (currentUrl.includes('/login')) {
            console.log('🔐 Login required, attempting login...');
            // Try to login with correct credentials
            await page.fill('input[name="username"], input[type="text"]', 'admin');
            await page.fill('input[name="password"], input[type="password"]', 'admin123');
            await page.click('button[type="submit"], input[type="submit"]');
            
            // Wait for login to complete
            await page.waitForTimeout(3000);
            
            // Check if login was successful (may redirect to dashboard or stay on login if failed)
            const afterLoginUrl = page.url();
            console.log(`After login URL: ${afterLoginUrl}`);
            
            if (afterLoginUrl.includes('/login')) {
                console.log('❌ Login failed, but proceeding to test PPPoE directly...');
            }
        }
        
        // Step 2: Go directly to PPPoE page
        console.log('📍 Step 2: Accessing PPPoE page directly...');
        await page.goto('http://localhost:3006/pppoe');
        await page.waitForLoadState('networkidle');
        
        const pppoeUrl = page.url();
        console.log(`PPPoE page URL: ${pppoeUrl}`);
        
        // Step 3: Analyze PPPoE page content
        console.log('📍 Step 3: Analyzing PPPoE interface...');
        const pageContent = await page.content();
        
        // Look for key elements
        const hasForm = pageContent.includes('<form') || pageContent.includes('form');
        const hasUsername = pageContent.toLowerCase().includes('username') || pageContent.includes('name');
        const hasPassword = pageContent.toLowerCase().includes('password');
        const hasProfile = pageContent.toLowerCase().includes('profile');
        const hasCustomer = pageContent.toLowerCase().includes('customer');
        const hasTable = pageContent.toLowerCase().includes('table');
        const hasCreateButton = pageContent.toLowerCase().includes('create') || pageContent.toLowerCase().includes('tambah');
        const hasPPPoEText = pageContent.toLowerCase().includes('pppoe') || pageContent.toLowerCase().includes('ppp');
        
        console.log('PPPoE Page Analysis:');
        console.log(`  - Has form: ${hasForm}`);
        console.log(`  - Has username field: ${hasUsername}`);
        console.log(`  - Has password field: ${hasPassword}`);
        console.log(`  - Has profile field: ${hasProfile}`);
        console.log(`  - Has customer field: ${hasCustomer}`);
        console.log(`  - Has table: ${hasTable}`);
        console.log(`  - Has create button: ${hasCreateButton}`);
        console.log(`  - Has PPPoE text: ${hasPPPoEText}`);
        
        // Take screenshot of PPPoE page
        await page.screenshot({ path: 'pppoe-page-full.png', fullPage: true });
        console.log('📸 Screenshot saved: pppoe-page-full.png');
        
        // Look for specific elements by their selectors
        console.log('📍 Step 4: Looking for interactive elements...');
        
        // Find all buttons and links
        const buttons = await page.$$eval('button, a[href], input[type="submit"]', elements =>
            elements.map(el => ({
                tag: el.tagName,
                text: el.textContent?.trim(),
                href: el.href,
                type: el.type,
                className: el.className
            }))
        );
        
        console.log('Interactive elements found:', buttons.length);
        buttons.forEach((btn, index) => {
            if (btn.text && btn.text.length > 0 && btn.text.length < 100) {
                console.log(`  ${index + 1}. [${btn.tag}] ${btn.text} (${btn.href || btn.type || 'N/A'})`);
            }
        });
        
        // Look for create/add/tambah buttons
        const createButtons = await page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("Tambah"), a:has-text("Create"), a:has-text("Add"), a:has-text("Tambah")').all();
        console.log(`Found ${createButtons.length} create/add buttons`);
        
        if (createButtons.length > 0) {
            console.log('📍 Step 5: Clicking create button to open user creation form...');
            await createButtons[0].click();
            await page.waitForLoadState('networkidle');
            
            // Take screenshot after clicking create
            await page.screenshot({ path: 'pppoe-create-form.png', fullPage: true });
            console.log('📸 Screenshot saved: pppoe-create-form.png');
            
            // Analyze the create form
            const createFormContent = await page.content();
            const hasCreateForm = createFormContent.includes('<form') || createFormContent.includes('form');
            const hasCreateUsername = createFormContent.toLowerCase().includes('username') || createFormContent.toLowerCase().includes('name');
            const hasCreatePassword = createFormContent.toLowerCase().includes('password');
            const hasCreateProfile = createFormContent.toLowerCase().includes('profile');
            
            console.log('Create Form Analysis:');
            console.log(`  - Has form: ${hasCreateForm}`);
            console.log(`  - Has username field: ${hasCreateUsername}`);
            console.log(`  - Has password field: ${hasCreatePassword}`);
            console.log(`  - Has profile field: ${hasCreateProfile}`);
            
            // Try to fill the form if it exists
            if (hasCreateForm && hasCreateUsername && hasCreatePassword) {
                console.log('📍 Step 6: Creating 3 test PPPoE users...');
                
                for (let i = 1; i <= 3; i++) {
                    const username = `testpppoe${Date.now()}_${i}`;
                    const password = `TestPass123_${i}`;
                    
                    console.log(`Creating user ${i}: ${username}`);
                    
                    try {
                        // If we need to refresh the form for each user
                        if (i > 1) {
                            // Go back to create form
                            await page.goBack();
                            await page.waitForTimeout(1000);
                            createButtons[0].click();
                            await page.waitForLoadState('networkidle');
                        }
                        
                        // Fill username
                        const usernameField = await page.locator('input[name*="username"], input[name*="name"], input[id*="username"], input[id*="name"]').first();
                        if (await usernameField.isVisible()) {
                            await usernameField.clear();
                            await usernameField.fill(username);
                            console.log(`✅ Username filled: ${username}`);
                        } else {
                            console.log(`❌ Username field not found`);
                        }
                        
                        // Fill password
                        const passwordField = await page.locator('input[name*="password"], input[type="password"]').first();
                        if (await passwordField.isVisible()) {
                            await passwordField.clear();
                            await passwordField.fill(password);
                            console.log(`✅ Password filled: ${password}`);
                        } else {
                            console.log(`❌ Password field not found`);
                        }
                        
                        // Look for profile selection
                        const profileSelect = await page.locator('select[name*="profile"], select[name*="plan"], select[name*="package"]').first();
                        if (await profileSelect.isVisible()) {
                            const options = await profileSelect.$$eval('option', opts => 
                                opts.map(opt => ({ value: opt.value, text: opt.text }))
                            );
                            console.log('Available profiles:', options.slice(0, 5)); // Show first 5 options
                            if (options.length > 1) {
                                await profileSelect.selectOption({ index: 1 }); // Select first non-default option
                                console.log('✅ Profile selected');
                            }
                        }
                        
                        // Look for customer selection
                        const customerSelect = await page.locator('select[name*="customer"], select[name*="pelanggan"]').first();
                        if (await customerSelect.isVisible()) {
                            const options = await customerSelect.$$eval('option', opts => 
                                opts.map(opt => ({ value: opt.value, text: opt.text }))
                            );
                            console.log('Available customers:', options.slice(0, 5)); // Show first 5 options
                            if (options.length > 1) {
                                await customerSelect.selectOption({ index: 1 }); // Select first non-default option
                                console.log('✅ Customer selected');
                            }
                        }
                        
                        // Submit form
                        const submitButton = await page.locator('button[type="submit"], input[type="submit"], button:has-text("Save"), button:has-text("Create"), button:has-text("Simpan")').first();
                        if (await submitButton.isVisible()) {
                            await submitButton.click();
                            console.log(`✅ Form submitted for user: ${username}`);
                            
                            // Wait for processing
                            await page.waitForTimeout(3000);
                            
                            // Look for success message
                            const successSelectors = ['.alert-success', '.success', '.message:has-text("success")', '.toast:has-text("success")', '[class*="success"]'];
                            let successFound = false;
                            
                            for (const selector of successSelectors) {
                                try {
                                    const successElement = await page.locator(selector).first();
                                    if (await successElement.isVisible({ timeout: 2000 })) {
                                        const successText = await successElement.textContent();
                                        console.log(`✅ Success message: ${successText}`);
                                        successFound = true;
                                        break;
                                    }
                                } catch (e) {
                                    // Continue to next selector
                                }
                            }
                            
                            if (!successFound) {
                                console.log(`⚠️ User ${username} submitted - checking for success via URL or content changes`);
                            }
                            
                            // Take screenshot after submission
                            await page.screenshot({ path: `pppoe-user-${i}-result.png`, fullPage: true });
                            
                        } else {
                            console.log(`❌ Submit button not found for user ${username}`);
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error creating user ${i}:`, error.message);
                        await page.screenshot({ path: `pppoe-user-${i}-error.png`, fullPage: true });
                    }
                }
            } else {
                console.log('❌ Create form not found or incomplete');
            }
        } else {
            console.log('❌ No create/add buttons found on PPPoE page');
        }
        
        // Step 7: Check PPPoE user list
        console.log('📍 Step 7: Checking PPPoE user list...');
        await page.goto('http://localhost:3006/pppoe');
        await page.waitForLoadState('networkidle');
        
        // Look for table with user data
        const hasUserTable = await page.locator('table').first().isVisible();
        if (hasUserTable) {
            console.log('✅ User table found');
            
            // Get table rows
            const tableRows = await page.locator('table tbody tr').all();
            console.log(`Found ${tableRows.length} users in table`);
            
            if (tableRows.length > 0) {
                // Get data from first few rows
                for (let i = 0; i < Math.min(5, tableRows.length); i++) {
                    const rowData = await tableRows[i].$$eval('td', cells => 
                        cells.map(cell => cell.textContent?.trim())
                    );
                    console.log(`User ${i + 1}:`, rowData);
                }
            }
        } else {
            console.log('❌ No user table found');
        }
        
        await page.screenshot({ path: 'pppoe-final-list.png', fullPage: true });
        console.log('📸 Final screenshot saved: pppoe-final-list.png');
        
        console.log('🏁 PPPoE User Creation Test Completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'pppoe-test-error.png', fullPage: true });
    } finally {
        await browser.close();
    }
}

// Run the test
testPPPoEUserCreation().catch(console.error);
