const { chromium } = require('playwright');

async function testPPPoEUserCreation() {
    console.log('🚀 Starting PPPoE User Creation Test...');
    
    const browser = await chromium.launch({ headless: false, slowMo: 1000 });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Step 1: Login first
        console.log('📍 Step 1: Logging in...');
        await page.goto('http://localhost:3006/login');
        
        await page.fill('input[name="username"]', 'admin');
        await page.fill('input[name="password"]', 'admin123');
        await page.click('button[type="submit"]');
        
        // Wait for login to complete
        await page.waitForTimeout(3000);
        
        // Step 2: Go directly to PPPoE creation page
        console.log('📍 Step 2: Accessing PPPoE creation page...');
        await page.goto('http://localhost:3006/pppoe/create');
        await page.waitForLoadState('networkidle');
        
        const currentUrl = page.url();
        console.log('Current URL: ' + currentUrl);
        
        // Take screenshot of the creation page
        await page.screenshot({ path: 'pppoe-create-page.png', fullPage: true });
        console.log('📸 Screenshot saved: pppoe-create-page.png');
        
        // Step 3: Analyze the creation form
        const pageContent = await page.content();
        const hasForm = pageContent.includes('<form') || pageContent.includes('form');
        const hasUsername = pageContent.toLowerCase().includes('username') || pageContent.toLowerCase().includes('name');
        const hasPassword = pageContent.toLowerCase().includes('password');
        const hasProfile = pageContent.toLowerCase().includes('profile');
        const hasCustomer = pageContent.toLowerCase().includes('customer');
        
        console.log('PPPoE Creation Form Analysis:');
        console.log('  - Has form: ' + hasForm);
        console.log('  - Has username field: ' + hasUsername);
        console.log('  - Has password field: ' + hasPassword);
        console.log('  - Has profile field: ' + hasProfile);
        console.log('  - Has customer field: ' + hasCustomer);
        
        // Step 4: Find all input fields
        const inputFields = await page.$$eval('input, select, textarea', elements =>
            elements.map(el => ({
                tag: el.tagName,
                type: el.type,
                name: el.name,
                id: el.id,
                placeholder: el.placeholder,
                required: el.required
            }))
        );
        
        console.log('Form fields found:');
        inputFields.forEach((field, index) => {
            console.log('  ' + (index + 1) + '. [' + field.tag + '] name="' + field.name + '" type="' + field.type + '" id="' + field.id + '" placeholder="' + field.placeholder + '" required=' + field.required);
        });
        
        // Step 5: Try to create 3 test users
        if (hasForm && hasUsername && hasPassword) {
            console.log('📍 Step 5: Creating 3 test PPPoE users...');
            
            for (let i = 1; i <= 3; i++) {
                const username = 'testpppoe' + Date.now() + '_' + i;
                const password = 'TestPass123_' + i;
                
                console.log('\n--- Creating User ' + i + ': ' + username + ' ---');
                
                try {
                    // If we need to refresh the form for each user (except first)
                    if (i > 1) {
                        await page.goto('http://localhost:3006/pppoe/create');
                        await page.waitForLoadState('networkidle');
                    }
                    
                    // Fill username field
                    const usernameSelectors = [
                        'input[name*="username"]',
                        'input[name*="name"]',
                        'input[id*="username"]',
                        'input[id*="name"]',
                        'input[placeholder*="username" i]',
                        'input[placeholder*="name" i]'
                    ];
                    
                    let usernameFilled = false;
                    for (const selector of usernameSelectors) {
                        try {
                            const field = await page.locator(selector).first();
                            if (await field.isVisible()) {
                                await field.clear();
                                await field.fill(username);
                                console.log('✅ Username filled: ' + username);
                                usernameFilled = true;
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    if (!usernameFilled) {
                        console.log('❌ Could not find username field');
                        continue;
                    }
                    
                    // Fill password field
                    const passwordSelectors = [
                        'input[name*="password"]',
                        'input[type="password"]',
                        'input[id*="password"]',
                        'input[placeholder*="password" i]'
                    ];
                    
                    let passwordFilled = false;
                    for (const selector of passwordSelectors) {
                        try {
                            const field = await page.locator(selector).first();
                            if (await field.isVisible()) {
                                await field.clear();
                                await field.fill(password);
                                console.log('✅ Password filled: ' + password);
                                passwordFilled = true;
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    if (!passwordFilled) {
                        console.log('❌ Could not find password field');
                        continue;
                    }
                    
                    // Look for profile selection
                    const profileSelectors = [
                        'select[name*="profile"]',
                        'select[name*="plan"]',
                        'select[name*="package"]',
                        'select[id*="profile"]',
                        'select[id*="plan"]'
                    ];
                    
                    for (const selector of profileSelectors) {
                        try {
                            const select = await page.locator(selector).first();
                            if (await select.isVisible()) {
                                const options = await select.$$eval('option', opts => 
                                    opts.map(opt => ({ value: opt.value, text: opt.text }))
                                );
                                console.log('Available profiles: ' + options.length + ' options');
                                if (options.length > 1) {
                                    await select.selectOption({ index: 1 });
                                    console.log('✅ Profile selected: ' + options[1].text);
                                }
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    // Look for customer selection
                    const customerSelectors = [
                        'select[name*="customer"]',
                        'select[name*="pelanggan"]',
                        'select[id*="customer"]',
                        'select[id*="pelanggan"]'
                    ];
                    
                    for (const selector of customerSelectors) {
                        try {
                            const select = await page.locator(selector).first();
                            if (await select.isVisible()) {
                                const options = await select.$$eval('option', opts => 
                                    opts.map(opt => ({ value: opt.value, text: opt.text }))
                                );
                                console.log('Available customers: ' + options.length + ' options');
                                if (options.length > 1) {
                                    await select.selectOption({ index: 1 });
                                    console.log('✅ Customer selected: ' + options[1].text);
                                }
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    // Submit the form
                    const submitSelectors = [
                        'button[type="submit"]',
                        'input[type="submit"]',
                        'button:has-text("Simpan")',
                        'button:has-text("Save")',
                        'button:has-text("Create")',
                        'button:has-text("Buat")',
                        'button:has-text("Tambah")',
                        '.btn-submit',
                        '.btn-primary'
                    ];
                    
                    let formSubmitted = false;
                    for (const selector of submitSelectors) {
                        try {
                            const button = await page.locator(selector).first();
                            if (await button.isVisible()) {
                                await button.click();
                                console.log('✅ Form submitted using: ' + selector);
                                formSubmitted = true;
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    if (!formSubmitted) {
                        console.log('❌ Could not find submit button');
                        continue;
                    }
                    
                    // Wait for processing
                    await page.waitForTimeout(5000);
                    
                    // Check for success indicators
                    const afterSubmitUrl = page.url();
                    console.log('After submission URL: ' + afterSubmitUrl);
                    
                    // Look for success messages
                    const successSelectors = [
                        '.alert-success',
                        '.success',
                        '.toast-success',
                        '[class*="success"]',
                        '.message.success'
                    ];
                    
                    let successFound = false;
                    for (const selector of successSelectors) {
                        try {
                            const element = await page.locator(selector).first();
                            if (await element.isVisible({ timeout: 2000 })) {
                                const text = await element.textContent();
                                console.log('✅ Success message: ' + text);
                                successFound = true;
                                break;
                            }
                        } catch (e) {
                            // Continue to next selector
                        }
                    }
                    
                    if (!successFound) {
                        // Check if redirected to list page (success)
                        if (afterSubmitUrl.includes('/pppoe') && !afterSubmitUrl.includes('/create')) {
                            console.log('✅ Form submitted successfully (redirected to list page)');
                            successFound = true;
                        } else {
                            console.log('⚠️ Form submitted - checking for success...');
                        }
                    }
                    
                    // Take screenshot after submission
                    await page.screenshot({ path: 'pppoe-user-' + i + '-submission.png', fullPage: true });
                    console.log('📸 Screenshot saved: pppoe-user-' + i + '-submission.png');
                    
                } catch (error) {
                    console.error('❌ Error creating user ' + i + ':', error.message);
                    await page.screenshot({ path: 'pppoe-user-' + i + '-error.png', fullPage: true });
                }
            }
        } else {
            console.log('❌ PPPoE creation form not available or incomplete');
        }
        
        // Step 6: Check the PPPoE list to verify created users
        console.log('\n📍 Step 6: Checking PPPoE user list...');
        await page.goto('http://localhost:3006/pppoe');
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ path: 'pppoe-final-user-list.png', fullPage: true });
        console.log('📸 Final user list screenshot saved: pppoe-final-user-list.png');
        
        // Look for user table
        const tableExists = await page.locator('table').first().isVisible();
        if (tableExists) {
            const rows = await page.locator('table tbody tr').all();
            console.log('✅ Found ' + rows.length + ' users in PPPoE list');
            
            // Extract data from first few rows
            for (let i = 0; i < Math.min(5, rows.length); i++) {
                try {
                    const cells = await rows[i].$$eval('td', tds => 
                        tds.map(td => td.textContent?.trim())
                    );
                    console.log('User ' + (i + 1) + ': [' + cells.join('] [') + ']');
                } catch (e) {
                    console.log('Could not extract data for user ' + (i + 1));
                }
            }
        } else {
            console.log('❌ No user table found');
        }
        
        console.log('\n🏁 PPPoE User Creation Test Completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'pppoe-test-error.png', fullPage: true });
    } finally {
        await browser.close();
    }
}

// Run the test
testPPPoEUserCreation().catch(console.error);
