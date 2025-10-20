const axios = require('axios');

async function testLogin() {
  try {
    console.log('Testing login to Mikrotik Billing System...');
    
    // First get the login page to get any cookies/tokens
    const loginPage = await axios.get('http://localhost:3005/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });
    
    console.log('Login page status:', loginPage.status);
    
    // Now try to login
    const loginData = {
      username: 'admin',
      password: 'admin123'
    };
    
    const response = await axios.post('http://localhost:3005/login', loginData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 400; // Accept any status less than 400
      }
    });
    
    console.log('Login response status:', response.status);
    console.log('Login response headers:', response.headers['location'] || 'No redirect');
    console.log('Response contains dashboard:', response.data.includes('Dashboard') ? 'Yes' : 'No');
    
    if (response.status === 302 && response.headers.location) {
      console.log('Redirected to:', response.headers.location);
      
      // Follow the redirect
      const dashboardResponse = await axios.get('http://localhost:3005' + response.headers.location, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          'Cookie': response.headers['set-cookie'] ? response.headers['set-cookie'].join('; ') : ''
        }
      });
      
      console.log('Dashboard status:', dashboardResponse.status);
      console.log('Dashboard contains:', dashboardResponse.data.includes('Dashboard') ? 'Dashboard found' : 'Dashboard not found');
    }
    
  } catch (error) {
    console.error('Login test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data.substring(0, 200));
    }
  }
}

testLogin();
