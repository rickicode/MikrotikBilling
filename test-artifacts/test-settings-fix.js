// Test script to verify settings fix
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3005,
    path: '/api/settings',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Cookie': 'test-auth' // This won't work but let's see the response
    }
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response data:');
        console.log(data);

        try {
            const parsed = JSON.parse(data);
            console.log('\nParsed JSON:');
            console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('Not valid JSON');
        }
    });
});

req.on('error', (e) => {
    console.log(`Request error: ${e.message}`);
});

req.end();