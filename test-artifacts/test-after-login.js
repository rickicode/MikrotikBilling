#!/usr/bin/env node

// Test after successful login
const { chromium } = require('playwright');

async function testAfterLogin() {
    console.log('🔐 Testing Mikrotik Billing System After Login');
    console.log('='.repeat(60));

    let browser;
    let page;

    try {
        // Launch browser
        console.log('\n🚀 Launching browser...');
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage();

        // Login first
        console.log('\n🔐 Logging in...');
        await page.goto('http://localhost:3005/login', { waitUntil: 'domcontentloaded' });

        await page.fill('input[type="text"], input[name*="username"], input[name*="user"]', 'admin');
        await page.fill('input[type="password"], input[name*="password"], input[name*="pass"]', 'admin123');
        await page.click('button[type="submit"], input[type="submit"]');

        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
        console.log('✅ Login completed');

        // Check if we're logged in
        const currentUrl = page.url();
        console.log('📄 Current URL:', currentUrl);
        console.log('📄 Page title:', await page.title());

        // Test 1: Look for Mikrotik status indicators
        console.log('\n🎯 Test 1: Checking Mikrotik status after login...');
        try {
            const statusIndicators = await page.$$('[data-mikrotik-status], .mikrotik-status, .connection-status, [class*="status"]');
            console.log(`📊 Found ${statusIndicators.length} status elements`);

            for (let i = 0; i < Math.min(statusIndicators.length, 5); i++) {
                const element = statusIndicators[i];
                try {
                    const text = await element.textContent();
                    const classes = await element.getAttribute('class');
                    console.log(`   Status ${i + 1}: "${text?.trim()}" (${classes})`);
                } catch (e) {
                    console.log(`   Status ${i + 1}: Unable to read content`);
                }
            }
        } catch (error) {
            console.log('❌ Error checking status:', error.message);
        }

        // Test 2: Look for voucher generation section
        console.log('\n🎯 Test 2: Looking for voucher generation section...');
        try {
            const voucherSections = await page.$$('[href*="voucher"], [class*="voucher"], button:has-text("Voucher")');
            console.log(`📊 Found ${voucherSections.length} voucher-related elements`);

            if (voucherSections.length > 0) {
                console.log('✅ Voucher section found, clicking...');
                await voucherSections[0].click();
                await page.waitForLoadState('domcontentloaded', { timeout: 5000 });

                console.log('📄 After click URL:', page.url());

                // Look for voucher generation form
                const voucherForms = await page.$$('form');
                const generateButtons = await page.$$('button:has-text("Generate"), button:has-text("Create"), button:has-text("Buat")');

                console.log(`📊 Found ${voucherForms.length} forms and ${generateButtons.length} generate buttons`);

                if (generateButtons.length > 0) {
                    console.log('✅ Generate buttons found');

                    // Try to fill voucher form
                    const inputs = await page.$$('input[type="number"], input[type="text"], select');
                    console.log(`📊 Found ${inputs.length} form inputs`);

                    // Fill sample data
                    for (const input of inputs.slice(0, 3)) {
                        try {
                            const inputType = await input.getAttribute('type');
                            const inputName = await input.getAttribute('name');

                            if (inputType === 'number') {
                                await input.fill('1');
                                console.log(`   Filled number input: ${inputName}`);
                            } else if (inputType === 'text' || !inputType) {
                                const placeholder = await input.getAttribute('placeholder');
                                if (placeholder?.toLowerCase().includes('prefix')) {
                                    await input.fill('TEST');
                                    console.log(`   Filled prefix input: ${inputName}`);
                                }
                            }
                        } catch (e) {
                            console.log('   Error filling input:', e.message);
                        }
                    }

                    // Try to click generate
                    console.log('🎯 Attempting to generate voucher...');
                    await generateButtons[0].click();
                    await page.waitForTimeout(2000);

                    console.log('✅ Generate button clicked');
                    console.log('📄 After generate URL:', page.url());

                    // Look for success/error messages
                    const messages = await page.$$('[class*="success"], [class*="error"], [class*="message"], .alert');
                    console.log(`📊 Found ${messages.length} messages`);

                    for (let i = 0; i < Math.min(messages.length, 3); i++) {
                        try {
                            const text = await messages[i].textContent();
                            const classes = await messages[i].getAttribute('class');
                            console.log(`   Message ${i + 1}: "${text?.trim()}" (${classes})`);
                        } catch (e) {
                            console.log(`   Message ${i + 1}: Unable to read`);
                        }
                    }
                }
            }
        } catch (error) {
            console.log('❌ Error testing voucher generation:', error.message);
        }

        // Test 3: Check for PPPoE section
        console.log('\n🎯 Test 3: Looking for PPPoE section...');
        try {
            const pppoeSections = await page.$$('[href*="pppoe"], [class*="pppoe"], button:has-text("PPPoE")');
            console.log(`📊 Found ${pppoeSections.length} PPPoE-related elements`);

            if (pppoeSections.length > 0) {
                console.log('✅ PPPoE section found');
            }
        } catch (error) {
            console.log('❌ Error checking PPPoE section:', error.message);
        }

        // Test 4: Monitor network activity for Mikrotik calls
        console.log('\n🎯 Test 4: Monitoring Mikrotik API calls...');

        const mikrotikRequests = [];
        page.on('request', request => {
            const url = request.url();
            if (url.includes('mikrotik') || url.includes('router') || url.includes('api/voucher') || url.includes('api/pppoe')) {
                mikrotikRequests.push({
                    method: request.method(),
                    url: url,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Wait for potential API calls
        await page.waitForTimeout(3000);

        if (mikrotikRequests.length > 0) {
            console.log('✅ Found Mikrotik-related requests:');
            mikrotikRequests.forEach((req, index) => {
                console.log(`   ${index + 1}. ${req.method} ${req.url}`);
            });
        } else {
            console.log('⚠️ No Mikrotik-related requests detected');
        }

        // Test 5: Take final screenshot
        console.log('\n📸 Taking final screenshot...');
        await page.screenshot({
            path: '/home/ricki/workspaces/MikrotikBilling/test-after-login-screenshot.png',
            fullPage: true
        });
        console.log('✅ Final screenshot saved');

        console.log('\n🎉 Post-login testing completed!');

    } catch (error) {
        console.error('❌ Post-login test failed:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

testAfterLogin();