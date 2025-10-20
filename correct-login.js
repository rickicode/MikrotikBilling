const { chromium } = require('playwright');
const fs = require('fs');

async function performLogin() {
    console.log('🔑 Performing login with correct credentials...');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Go to login page
        await page.goto('http://localhost:3005/login');
        await page.waitForLoadState('networkidle');
        
        console.log('📄 Login page loaded');
        
        // Fill in credentials
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin');
        
        console.log('🔐 Credentials filled');
        
        // Submit form
        await page.click('button[type="submit"]');
        
        // Wait for navigation/redirect
        await page.waitForLoadState('networkidle');
        
        // Check if login was successful
        const currentUrl = page.url();
        console.log('🎯 URL after login:', currentUrl);
        
        if (!currentUrl.includes('/login')) {
            console.log('✅ Login successful!');
            
            // Get cookies
            const cookies = await context.cookies();
            console.log('🍪 Retrieved', cookies.length, 'cookies');
            
            // Save cookies in the expected format
            let cookieContent = '# Netscape HTTP Cookie File\n# http://curl.haxx.se/docs/http-cookies.html\n# This is a generated file! Edit at your own risk.\n\n';
            
            cookies.forEach(cookie => {
                const httpOnlyFlag = cookie.httpOnly ? '#HttpOnly_' : '';
                const domain = cookie.domain === 'localhost' ? 'localhost' : cookie.domain;
                
                cookieContent += `${httpOnlyFlag}${domain}\t`;
                cookieContent += 'FALSE\t'; // domain flag
                cookieContent += `${cookie.path}\t`;
                cookieContent += cookie.secure ? 'TRUE\t' : 'FALSE\t';
                cookieContent += (cookie.expires || 1763570824) + '\t'; // expiry
                cookieContent += `${cookie.name}\t`;
                cookieContent += `${cookie.value}\n`;
            });
            
            fs.writeFileSync('./cookies.txt', cookieContent);
            console.log('✅ Cookies saved to cookies.txt');
            
            // Verify cookies work
            console.log('🔍 Verifying cookies...');
            await page.goto('http://localhost:3005');
            await page.waitForLoadState('networkidle');
            
            const verifyUrl = page.url();
            if (!verifyUrl.includes('/login')) {
                console.log('✅ Cookie authentication verified!');
                console.log('🎯 Ready for voucher generation test');
                
                // Test going to vouchers page
                await page.goto('http://localhost:3005/vouchers');
                await page.waitForLoadState('networkidle');
                
                const vouchersUrl = page.url();
                if (vouchersUrl.includes('/vouchers')) {
                    console.log('✅ Vouchers page accessible!');
                }
                
            } else {
                console.log('❌ Cookie verification failed');
            }
            
            // Keep browser open for a few seconds
            await page.waitForTimeout(5000);
            
        } else {
            console.log('❌ Login failed - still on login page');
            
            // Check for error messages
            const errorElements = await page.$$('.alert-danger, .error-message, .text-red-500');
            if (errorElements.length > 0) {
                for (let element of errorElements) {
                    const errorText = await element.textContent();
                    console.log('❌ Error message:', errorText);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error during login:', error.message);
    } finally {
        await browser.close();
    }
}

performLogin();
