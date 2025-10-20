const { chromium } = require('playwright');
const fs = require('fs');

async function simpleLogin() {
    console.log('🔑 Simple login process...');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Go to login page
        await page.goto('http://localhost:3005/login');
        await page.waitForLoadState('networkidle');
        
        console.log('📄 Login page loaded');
        
        // Fill login form
        await page.fill('input[name="username"], input[type="text"]', 'admin');
        await page.fill('input[name="password"], input[type="password"]', 'admin123');
        
        // Click login button
        await page.click('button[type="submit"], input[type="submit"], .btn-login');
        
        // Wait for navigation after login
        await page.waitForLoadState('networkidle');
        
        const currentUrl = page.url();
        console.log('🎯 Current URL after login:', currentUrl);
        
        if (!currentUrl.includes('/login')) {
            console.log('✅ Login successful!');
            
            // Get cookies
            const cookies = await context.cookies();
            
            // Save in simple format
            const cookieData = {
                url: 'http://localhost:3005',
                cookies: cookies
            };
            
            fs.writeFileSync('./simple-cookies.json', JSON.stringify(cookieData, null, 2));
            console.log('✅ Cookies saved to simple-cookies.json');
            
            // Test authentication
            await page.goto('http://localhost:3005');
            await page.waitForLoadState('networkidle');
            
            const testUrl = page.url();
            if (!testUrl.includes('/login')) {
                console.log('✅ Authentication verified!');
            }
            
            // Wait a bit before closing
            await page.waitForTimeout(3000);
            
        } else {
            console.log('❌ Login failed - still on login page');
        }
        
    } catch (error) {
        console.error('❌ Error during login:', error.message);
    } finally {
        await browser.close();
    }
}

simpleLogin();
