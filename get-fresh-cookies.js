const { chromium } = require('playwright');
const fs = require('fs');

// Configuration
const BASE_URL = 'http://localhost:3005';
const COOKIES_FILE = './fresh-cookies.txt';

async function getFreshCookies() {
    console.log('🔑 Getting fresh authentication cookies...');
    
    let browser;
    let context;
    let page;
    
    try {
        // Launch browser
        browser = await chromium.launch({ 
            headless: false, // Show browser for manual login if needed
            slowMo: 500
        });
        
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        
        page = await context.newPage();
        
        // Navigate to base URL
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');
        
        console.log('📄 Page loaded:', page.url());
        
        // Check if we're on login page
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('Login')) {
            console.log('🔐 Login page detected. Please login manually...');
            console.log('Username: admin');
            console.log('Password: [your password]');
            console.log('Press Enter when login is complete...');
            
            // Wait for successful login (redirect from login page)
            await page.waitForURL(url => !url.includes('/login') && !url.includes('Login'), { timeout: 120000 });
            
            console.log('✅ Login successful!');
        } else {
            console.log('✅ Already logged in or login not required');
        }
        
        // Get cookies
        const cookies = await context.cookies();
        console.log('🍪 Retrieved ' + cookies.length + ' cookies');
        
        // Save cookies in Netscape format
        let cookieContent = '# Netscape HTTP Cookie File\n';
        cookieContent += '# This is a generated file!\n\n';
        
        cookies.forEach(cookie => {
            const httpOnlyFlag = cookie.httpOnly ? '#HttpOnly_' : '';
            const secureFlag = cookie.secure ? 'TRUE' : 'FALSE';
            const domainFlag = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
            
            cookieContent += `${httpOnlyFlag}${cookie.domain}\t`;
            cookieContent += `${domainFlag}\t`;
            cookieContent += `${cookie.path}\t`;
            cookieContent += `${secureFlag}\t`;
            cookieContent += `${cookie.expires || 0}\t`;
            cookieContent += `${cookie.name}\t`;
            cookieContent += `${cookie.value}\n`;
        });
        
        fs.writeFileSync(COOKIES_FILE, cookieContent);
        console.log('✅ Cookies saved to: ' + COOKIES_FILE);
        
        // Test cookies by making a request
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');
        
        const finalUrl = page.url();
        if (!finalUrl.includes('/login')) {
            console.log('✅ Cookie authentication verified successfully!');
            console.log('🎯 Ready for voucher generation test');
        } else {
            throw new Error('Cookie authentication failed');
        }
        
        // Wait before closing
        console.log('⏳ Keeping browser open for 5 seconds...');
        await page.waitForTimeout(5000);
        
    } catch (error) {
        console.error('❌ Failed to get cookies:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the function
if (require.main === module) {
    getFreshCookies()
        .then(() => {
            console.log('\n✅ Cookie retrieval completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Cookie retrieval failed:', error);
            process.exit(1);
        });
}

module.exports = { getFreshCookies };
