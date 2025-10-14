const puppeteer = require('puppeteer');

async function loginAndGetToken() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Go to login page
    await page.goto('http://localhost:3005/login');

    // Wait for form to be ready
    await page.waitForSelector('#username');

    // Fill in credentials
    await page.type('#username', 'admin');
    await page.type('#password', 'admin123');

    // Submit form
    await Promise.all([
      page.waitForNavigation(),
      page.click('#loginBtn')
    ]);

    // Get token from localStorage or cookies
    const token = await page.evaluate(() => {
      return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    });

    console.log('Token:', token);

    // Also get cookies
    const cookies = await page.cookies();
    console.log('Cookies:', cookies);

    await browser.close();
    return token;
  } catch (error) {
    console.error('Error:', error);
    await browser.close();
    throw error;
  }
}

loginAndGetToken().then(token => {
  if (token) {
    console.log('\nSuccess! Got token:', token);
  }
}).catch(console.error);