const { chromium } = require('playwright');

async function finalVerification() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('🎯 FINAL VERIFICATION TEST');
    console.log('================================');
    
    // Setup error monitoring
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push('Console: ' + msg.text());
    });
    page.on('pageerror', error => errors.push('Page: ' + error.message));
    
    // Login with proper session handling
    console.log('🔐 Attempting login...');
    await page.goto('http://localhost:3005/login');
    await page.waitForLoadState('networkidle');
    
    // Fill login form
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');  
    await page.waitForLoadState('networkidle');
    
    // Wait for redirect to complete
    await page.waitForTimeout(2000);
    
    // Check if login was successful by checking URL or page content
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);
    
    if (currentUrl.includes('/login')) {
      console.log('❌ Login failed - still on login page');
      // Check for error messages
      const pageContent = await page.content();
      if (pageContent.includes('error') || pageContent.includes('invalid')) {
        console.log('Login error detected');
      }
      return;
    } else {
      console.log('✅ Authentication: SUCCESS');
    }
    
    // Test all main pages
    const pages = [
      { path: '/dashboard', name: 'Dashboard' },
      { path: '/customers', name: 'Customer Management' },
      { path: '/vouchers', name: 'Voucher Generation' },
      { path: '/pppoe', name: 'PPPoE Management' },
      { path: '/settings', name: 'Settings' },
      { path: '/plugins', name: 'Plugin Management' }
    ];
    
    let passedTests = 0;
    let totalTests = pages.length;
    
    for (const pageTest of pages) {
      try {
        console.log(`\n📄 Testing ${pageTest.name}...`);
        await page.goto('http://localhost:3005' + pageTest.path);
        await page.waitForLoadState('networkidle');
        
        // Wait for any redirects
        await page.waitForTimeout(1000);
        
        // Check if we were redirected back to login (session issue)
        if (page.url().includes('/login')) {
          console.log(`❌ ${pageTest.name}: REDIRECTED TO LOGIN (session expired)`);
          // Try to login again
          await page.fill('input[name="username"]', 'admin');
          await page.fill('input[name="password"]', 'admin');
          await page.click('button[type="submit"]');  
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);
          
          // Retry the page
          await page.goto('http://localhost:3005' + pageTest.path);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);
        }
        
        // Check if page loaded successfully (no 500 errors)
        const pageContent = await page.content();
        
        if (pageContent.includes('500') || pageContent.includes('Internal Server Error')) {
          console.log(`❌ ${pageTest.name}: SERVER ERROR`);
        } else if (page.url().includes('/login')) {
          console.log(`❌ ${pageTest.name}: AUTHENTICATION REQUIRED`);
        } else {
          console.log(`✅ ${pageTest.name}: LOADED SUCCESSFULLY`);
          passedTests++;
          
          // Test specific functionality
          if (pageTest.path === '/customers') {
            // Test add customer button
            try {
              const addBtn = await page.locator('button, a').filter({ hasText: /add|create|new/i }).first();
              if (await addBtn.isVisible()) {
                await addBtn.click();
                await page.waitForTimeout(1000);
                const formExists = await page.locator('form').isVisible();
                console.log(formExists ? '✅ Customer form: ACCESSIBLE' : 'ℹ️ Customer form: Not found');
              }
            } catch (e) {
              console.log('ℹ️ Customer form test: Not applicable');
            }
          }
          
          if (pageTest.path === '/vouchers') {
            // Test sync button
            try {
              const syncBtn = await page.locator('button').filter({ hasText: /sync|refresh/i }).first();
              if (await syncBtn.isVisible()) {
                console.log('✅ Voucher sync: BUTTON AVAILABLE');
              }
            } catch (e) {
              console.log('ℹ️ Voucher sync test: Not applicable');
            }
          }
          
          if (pageTest.path === '/settings') {
            // Test connection test button
            try {
              const testBtn = await page.locator('button').filter({ hasText: /test|connection/i }).first();
              if (await testBtn.isVisible()) {
                console.log('✅ Mikrotik test: BUTTON AVAILABLE');
              }
            } catch (e) {
              console.log('ℹ️ Mikrotik test: Not applicable');
            }
          }
          
          if (pageTest.path === '/plugins') {
            // Check if plugin system loads
            const hasPluginContent = pageContent.includes('plugin') || pageContent.includes('Plugin');
            console.log(hasPluginContent ? '✅ Plugin system: LOADED' : 'ℹ️ Plugin system: Empty or loading');
          }
        }
        
      } catch (error) {
        console.log(`❌ ${pageTest.name}: FAILED - ${error.message}`);
      }
    }
    
    // Final error check
    console.log('\n🔍 FINAL ERROR CHECK');
    console.log('======================');
    
    if (errors.length === 0) {
      console.log('✅ No JavaScript errors detected');
    } else {
      console.log('⚠️ JavaScript errors found:');
      errors.slice(0, 3).forEach(error => console.log('   -', error));
    }
    
    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('=================');
    console.log(`✅ Pages Passed: ${passedTests}/${totalTests}`);
    console.log(`🔍 JavaScript Errors: ${errors.length}`);
    console.log(`🌐 Server: http://localhost:3005`);
    
    if (passedTests >= totalTests * 0.8 && errors.length === 0) {
      console.log('\n🎉 MAJORITY OF TESTS PASSED! System is mostly functional.');
    } else if (passedTests >= totalTests * 0.5) {
      console.log('\n⚠️ PARTIAL SUCCESS. Some features need attention.');
    } else {
      console.log('\n❌ MULTIPLE ISSUES DETECTED. System needs review.');
    }
    
  } catch (error) {
    console.error('❌ Final verification failed:', error.message);
  } finally {
    await browser.close();
  }
}

finalVerification().catch(console.error);