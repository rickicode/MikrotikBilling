#!/usr/bin/env node

// Comprehensive browser testing using Playwright MCP
const { chromium } = require('playwright');

async function testSystemComprehensive() {
    console.log('🌐 Comprehensive Mikrotik Billing System Test');
    console.log('='.repeat(60));

    let browser;
    let page;

    try {
        // Launch browser
        console.log('\n🚀 Launching browser...');
        browser = await chromium.launch({
            headless: false, // Show browser for debugging
            slowMo: 500 // Slow down for visibility
        });
        page = await browser.newPage();

        // Test 1: Server accessibility
        console.log('\n🎯 Test 1: Server accessibility...');
        try {
            const response = await page.goto('http://localhost:3005', {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            console.log('✅ Server accessible:', response.status());
            console.log('📄 Page title:', await page.title());
        } catch (error) {
            console.log('❌ Server not accessible:', error.message);
            return;
        }

        // Test 2: Check Mikrotik status in UI
        console.log('\n🎯 Test 2: Checking Mikrotik status in UI...');
        try {
            // Look for Mikrotik status indicators
            await page.waitForSelector('body', { timeout: 5000 });

            // Check for status indicators
            const statusIndicators = await page.$$('[data-mikrotik-status], .mikrotik-status, .connection-status');
            if (statusIndicators.length > 0) {
                console.log('✅ Found Mikrotik status indicators in UI');

                for (const indicator of statusIndicators) {
                    const text = await indicator.textContent();
                    const classes = await indicator.getAttribute('class');
                    const dataset = await indicator.getAttribute('data-mikrotik-status');

                    console.log('   Status indicator:', {
                        text: text?.trim(),
                        classes: classes,
                        dataset: dataset
                    });
                }
            } else {
                console.log('⚠️ No Mikrotik status indicators found in current page');
            }
        } catch (error) {
            console.log('❌ Error checking Mikrotik status:', error.message);
        }

        // Test 3: Try to access dashboard
        console.log('\n🎯 Test 3: Accessing dashboard...');
        try {
            await page.goto('http://localhost:3005/dashboard', {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            console.log('✅ Dashboard loaded');
            console.log('📄 Dashboard title:', await page.title());

            // Look for dashboard elements
            const dashboardElements = await page.$$('[class*="dashboard"], [class*="mikrotik"], [class*="voucher"], [class*="status"]');
            console.log(`📊 Found ${dashboardElements.length} dashboard elements`);

        } catch (error) {
            console.log('❌ Dashboard access failed:', error.message);
        }

        // Test 4: Check for login form
        console.log('\n🎯 Test 4: Looking for login form...');
        try {
            const loginForms = await page.$$('form');
            const usernameInputs = await page.$$('input[type="text"], input[name*="username"], input[name*="user"]');
            const passwordInputs = await page.$$('input[type="password"], input[name*="password"], input[name*="pass"]');
            const submitButtons = await page.$$('button[type="submit"], input[type="submit"]');

            console.log('🔍 Found elements:', {
                forms: loginForms.length,
                usernameInputs: usernameInputs.length,
                passwordInputs: passwordInputs.length,
                submitButtons: submitButtons.length
            });

            if (usernameInputs.length > 0 && passwordInputs.length > 0) {
                console.log('✅ Login form detected');

                // Try to login with default credentials
                try {
                    await usernameInputs[0].fill('admin');
                    await passwordInputs[0].fill('admin123');

                    console.log('🔐 Attempting login...');
                    await submitButtons[0].click();

                    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
                    console.log('✅ Login attempt completed');

                } catch (loginError) {
                    console.log('⚠️ Login attempt failed:', loginError.message);
                }
            } else {
                console.log('⚠️ No login form found');
            }
        } catch (error) {
            console.log('❌ Error checking login form:', error.message);
        }

        // Test 5: Check network requests
        console.log('\n🎯 Test 5: Monitoring network requests...');

        page.on('request', request => {
            const url = request.url();
            if (url.includes('mikrotik') || url.includes('voucher') || url.includes('api')) {
                console.log('📡 Request:', request.method(), url);
            }
        });

        page.on('response', response => {
            const url = response.url();
            if (url.includes('mikrotik') || url.includes('voucher') || url.includes('api')) {
                console.log('📥 Response:', response.status(), url);
            }
        });

        // Wait a bit to capture network activity
        await page.waitForTimeout(3000);

        // Test 6: Check console logs for errors
        console.log('\n🎯 Test 6: Checking for console errors...');
        const logs = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                logs.push(msg.text());
            }
        });

        await page.waitForTimeout(2000);

        if (logs.length > 0) {
            console.log('❌ Found console errors:');
            logs.forEach((log, index) => {
                console.log(`   ${index + 1}. ${log}`);
            });
        } else {
            console.log('✅ No console errors detected');
        }

        // Test 7: Take screenshot for debugging
        console.log('\n📸 Taking screenshot...');
        try {
            await page.screenshot({
                path: '/home/ricki/workspaces/MikrotikBilling/test-screenshot.png',
                fullPage: true
            });
            console.log('✅ Screenshot saved: test-screenshot.png');
        } catch (error) {
            console.log('❌ Screenshot failed:', error.message);
        }

        console.log('\n🎉 Browser testing completed!');

    } catch (error) {
        console.error('❌ Browser test failed:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

testSystemComprehensive();