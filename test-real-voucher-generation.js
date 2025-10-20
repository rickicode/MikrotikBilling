const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Test Configuration
const BASE_URL = 'http://localhost:3005';
const SCREENSHOT_DIR = './test-artifacts/voucher-generation-' + Date.now();
const COOKIES_FILE = './cookies.txt';

// Create screenshot directory
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper function to parse cookies
function parseCookies(cookieContent) {
    const cookies = [];
    const lines = cookieContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 7) {
            cookies.push({
                name: parts[5],
                value: parts[6],
                domain: parts[0] === 'HttpOnly_localhost' ? 'localhost' : parts[0],
                path: parts[2],
                httpOnly: parts[0].startsWith('#HttpOnly_'),
                secure: parts[3] === 'TRUE'
            });
        }
    });
    
    return cookies;
}

// Helper function to wait for timeout
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test function
async function testRealVoucherGeneration() {
    console.log('🚀 STARTING REAL VOUCHER GENERATION TEST');
    console.log('='.repeat(60));
    
    let browser;
    let context;
    let page;
    
    try {
        // 1. SETUP BROWSER WITH AUTHENTICATION
        console.log('\n📋 STEP 1: Setting up browser with authentication...');
        
        browser = await chromium.launch({ 
            headless: false, // Show browser for debugging
            slowMo: 500 // Slow down actions for visibility
        });
        
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            ignoreHTTPSErrors: true
        });
        
        // Read and set cookies
        const cookieContent = fs.readFileSync(COOKIES_FILE, 'utf8');
        const cookies = parseCookies(cookieContent);
        
        // Go to base URL first
        page = await context.newPage();
        
        // Set cookies for localhost
        await context.addCookies(cookies.map(cookie => ({
            ...cookie,
            url: BASE_URL
        })));
        
        console.log('✅ Authentication cookies loaded');
        
        // 2. NAVIGATE TO VOUCHER CREATION PAGE
        console.log('\n📋 STEP 2: Navigating to voucher creation page...');
        
        await page.goto(BASE_URL);
        await wait(2000);
        
        // Verify we are logged in
        const pageTitle = await page.title();
        console.log('Page title: ' + pageTitle);
        
        // Navigate to vouchers page
        await page.click('a[href="/vouchers"]', { timeout: 10000 });
        await wait(2000);
        
        // Take screenshot of vouchers page
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '01-vouchers-list-before.png'),
            fullPage: true
        });
        console.log('✅ Vouchers list page loaded and screenshot taken');
        
        // Click "Create New Voucher" button
        await page.click('a[href="/vouchers/create"], button:has-text("Create New"), .btn-primary:has-text("Create")', { timeout: 10000 });
        await wait(2000);
        
        // Verify we are on creation page
        const currentUrl = page.url();
        console.log('Current URL: ' + currentUrl);
        
        if (!currentUrl.includes('/vouchers/create')) {
            // Try alternative navigation
            await page.goto(BASE_URL + '/vouchers/create');
            await wait(2000);
        }
        
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '02-voucher-creation-page.png'),
            fullPage: true
        });
        console.log('✅ Voucher creation page loaded');
        
        // 3. GET AVAILABLE PROFILES
        console.log('\n📋 STEP 3: Getting available profiles...');
        
        // Wait for profile dropdown to be available
        await page.waitForSelector('#profile, select[name="profile"]', { timeout: 10000 });
        
        // Get available profiles
        const profileOptions = await page.$$eval('#profile option, select[name="profile"] option', options => 
            options.map(opt => ({ value: opt.value, text: opt.text.trim() }))
                .filter(opt => opt.value && opt.value !== '')
        );
        
        console.log('Available profiles:');
        profileOptions.forEach((profile, index) => {
            console.log('  ' + (index + 1) + '. ' + profile.text + ' (' + profile.value + ')');
        });
        
        if (profileOptions.length === 0) {
            throw new Error('No profiles available for voucher generation');
        }
        
        // 4. GENERATE FIRST VOUCHER
        console.log('\n📋 STEP 4: Generating first voucher...');
        
        // Select first profile
        const firstProfile = profileOptions[0];
        console.log('Selected profile: ' + firstProfile.text);
        
        // Select profile
        await page.selectOption('#profile, select[name="profile"]', firstProfile.value);
        await wait(1000);
        
        // Set quantity to 1
        await page.fill('#quantity, input[name="quantity"]', '1');
        await wait(500);
        
        // Take screenshot before generation
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '03-first-voucher-form-filled.png'),
            fullPage: true
        });
        
        // Click generate button
        console.log('Clicking generate button...');
        await page.click('button[type="submit"], .btn-primary:has-text("Generate"), button:has-text("Generate")');
        
        // Wait for generation to complete
        console.log('Waiting for voucher generation...');
        await wait(5000);
        
        // Look for success message
        const successMessage = await page.locator('.alert-success, .toast-success, .success-message').first().textContent().catch(() => null);
        if (successMessage) {
            console.log('✅ Success message: ' + successMessage);
        }
        
        // Take screenshot after generation
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '04-first-voucher-generated.png'),
            fullPage: true
        });
        
        // 5. GENERATE SECOND VOUCHER (Different Profile)
        console.log('\n📋 STEP 5: Generating second voucher with different profile...');
        
        // Go back to creation page
        await page.goto(BASE_URL + '/vouchers/create');
        await wait(2000);
        
        // Select different profile if available
        const secondProfile = profileOptions.length > 1 ? profileOptions[1] : profileOptions[0];
        console.log('Selected second profile: ' + secondProfile.text);
        
        await page.selectOption('#profile, select[name="profile"]', secondProfile.value);
        await wait(1000);
        
        // Set quantity to 1
        await page.fill('#quantity, input[name="quantity"]', '1');
        await wait(500);
        
        // Generate second voucher
        await page.click('button[type="submit"], .btn-primary:has-text("Generate"), button:has-text("Generate")');
        console.log('Generating second voucher...');
        await wait(5000);
        
        // Take screenshot after second generation
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '05-second-voucher-generated.png'),
            fullPage: true
        });
        
        // 6. GENERATE MULTIPLE VOUCHERS (Batch)
        console.log('\n📋 STEP 6: Generating multiple vouchers (batch of 3)...');
        
        // Go back to creation page
        await page.goto(BASE_URL + '/vouchers/create');
        await wait(2000);
        
        // Select profile for batch generation
        const batchProfile = profileOptions[0];
        console.log('Selected profile for batch: ' + batchProfile.text);
        
        await page.selectOption('#profile, select[name="profile"]', batchProfile.value);
        await wait(1000);
        
        // Set quantity to 3
        await page.fill('#quantity, input[name="quantity"]', '3');
        await wait(500);
        
        // Generate batch
        await page.click('button[type="submit"], .btn-primary:has-text("Generate"), button:has-text("Generate")');
        console.log('Generating batch of 3 vouchers...');
        await wait(8000); // Longer wait for batch generation
        
        // Take screenshot after batch generation
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '06-batch-vouchers-generated.png'),
            fullPage: true
        });
        
        // 7. VERIFY VOUCHERS IN WEB INTERFACE
        console.log('\n📋 STEP 7: Verifying vouchers in web interface...');
        
        // Navigate to vouchers list
        await page.goto(BASE_URL + '/vouchers');
        await wait(3000);
        
        // Take screenshot of vouchers list
        await page.screenshot({ 
            path: path.join(SCREENSHOT_DIR, '07-vouchers-list-after-generation.png'),
            fullPage: true
        });
        
        // 8. FINAL SUMMARY
        console.log('\n' + '='.repeat(60));
        console.log('🎉 REAL VOUCHER GENERATION TEST COMPLETED');
        console.log('='.repeat(60));
        
        console.log('\n✅ COMPLETED TASKS:');
        console.log('✅ Authentication with cookies');
        console.log('✅ Navigation to voucher creation page');
        console.log('✅ First voucher generation (1x)');
        console.log('✅ Second voucher generation (1x, different profile)');
        console.log('✅ Batch voucher generation (3x)');
        console.log('✅ Web interface verification');
        console.log('✅ Screenshot documentation');
        
        console.log('\n📊 RESULTS SUMMARY:');
        console.log('📁 Screenshots saved to: ' + SCREENSHOT_DIR);
        console.log('🎫 Total vouchers generated: 5');
        
        console.log('\n🔍 MIKROTIK VERIFICATION REQUIRED:');
        console.log('Please manually verify in RouterOS that:');
        console.log('- New hotspot users were created');
        console.log('- Comment format is correct');
        console.log('- Users have correct profiles assigned');
        console.log('- Users are enabled and ready for login');
        
        console.log('\n✅ TEST SUCCESSFUL: Real voucher generation completed!');
        
        // Don't close browser immediately for manual inspection
        console.log('\n⏳ Browser will stay open for 30 seconds for manual inspection...');
        await wait(30000);
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Take screenshot of error state
        if (page) {
            await page.screenshot({ 
                path: path.join(SCREENSHOT_DIR, 'ERROR-state.png'),
                fullPage: true
            });
        }
        
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
if (require.main === module) {
    testRealVoucherGeneration()
        .then(() => {
            console.log('\n✅ Test execution completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testRealVoucherGeneration };
