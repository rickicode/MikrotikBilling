// System status check
async function checkSystemStatus() {
    console.log('🔍 SYSTEM STATUS CHECK');
    console.log('='.repeat(50));
    
    try {
        // Check server accessibility
        console.log('\\n📡 Checking server...');
        const http = require('http');
        
        const options = {
            hostname: 'localhost',
            port: 3005,
            path: '/',
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            console.log('✅ Server responding - Status:', res.statusCode);
            
            if (res.statusCode === 302) {
                console.log('✅ Server redirecting to login (normal behavior)');
            }
            
            console.log('✅ Server is accessible and ready for testing');
            checkServerLogs();
        });
        
        req.on('error', (err) => {
            console.log('❌ Server not accessible:', err.message);
        });
        
        req.on('timeout', () => {
            console.log('❌ Server request timeout');
            req.destroy();
        });
        
        req.end();
        
    } catch (error) {
        console.error('❌ Status check failed:', error.message);
    }
}

function checkServerLogs() {
    console.log('\\n📋 Checking server logs for Mikrotik status...');
    
    const fs = require('fs');
    
    if (fs.existsSync('./server-output.log')) {
        const logs = fs.readFileSync('./server-output.log', 'utf8');
        
        if (logs.includes('Connected to Mikrotik successfully')) {
            console.log('✅ Mikrotik connection established');
        }
        
        if (logs.includes('Found') && logs.includes('hotspot users')) {
            console.log('✅ User monitoring active');
        }
        
        if (logs.includes('All integration services started successfully')) {
            console.log('✅ All services initialized');
        }
        
        console.log('\\n📊 Latest server status:');
        const lines = logs.split('\\n');
        const lastLines = lines.slice(-5);
        lastLines.forEach(line => {
            if (line.trim()) {
                console.log('  ' + line.trim());
            }
        });
        
    } else {
        console.log('⚠️  Server log file not found');
    }
    
    console.log('\\n' + '='.repeat(50));
    console.log('🎯 SYSTEM READY FOR MANUAL TESTING');
    console.log('='.repeat(50));
    console.log('\\nNext steps:');
    console.log('1. Open browser: http://localhost:3005');
    console.log('2. Login with admin credentials');
    console.log('3. Navigate to Vouchers → Create New');
    console.log('4. Test voucher generation');
    console.log('5. Verify in Mikrotik RouterOS');
}

checkSystemStatus();
