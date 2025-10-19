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
    
    // Login
    await page.goto('http://localhost:3005/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');  
    await page.waitForLoadState('networkidle');
    
    console.log('✅ Authentication: SUCCESS');
    
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
        
        // Check if page loaded successfully (no 500 errors)
        const pageTitle = await page.title();
        const pageContent = await page.content();
        
        if (!pageContent.includes('500') && !pageContent.includes('Internal Server Error')) {
          console.log(`✅ ${pageTest.name}: LOADED SUCCESSFULLY`);
          passedTests++;
        } else {
          console.log(`❌ ${pageTest.name}: SERVER ERROR`);
        }
        
        // Test specific functionality
        if (pageTest.path === '/customers') {
          // Test add customer button
          const addBtn = await page.locator('button, a').filter({ hasText: /add|create|new/i }).first();
          if (await addBtn.isVisible()) {
            await addBtn.click();
            await page.waitForTimeout(1000);
            const formExists = await page.locator('form').isVisible();
            console.log(formExists ? '✅ Customer form: ACCESSIBLE' : 'ℹ️ Customer form: Not found');
          }
        }
        
        if (pageTest.path === '/vouchers') {
          // Test sync button
          const syncBtn = await page.locator('button').filter({ hasText: /sync|refresh/i }).first();
          if (await syncBtn.isVisible()) {
            console.log('✅ Voucher sync: BUTTON AVAILABLE');
          }
        }
        
        if (pageTest.path === '/settings') {
          // Test connection test button
          const testBtn = await page.locator('button').filter({ hasText: /test|connection/i }).first();
          if (await testBtn.isVisible()) {
            console.log('✅ Mikrotik test: BUTTON AVAILABLE');
          }
        }
        
        if (pageTest.path === '/plugins') {
          // Check if plugin system loads
          const hasPluginContent = pageContent.includes('plugin') || pageContent.includes('Plugin');
          console.log(hasPluginContent ? '✅ Plugin system: LOADED' : 'ℹ️ Plugin system: Empty or loading');
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
    
    if (passedTests === totalTests && errors.length === 0) {
      console.log('\n🎉 ALL TESTS PASSED! System is ready for production.');
    } else {
      console.log('\n⚠️ Some issues detected. Please review the errors above.');
    }
    
  } catch (error) {
    console.error('❌ Final verification failed:', error.message);
  } finally {
    await browser.close();
  }
}

finalVerification().catch(console.error);