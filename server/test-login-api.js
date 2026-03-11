const http = require('http');

const testLogin = async () => {
    console.log('🔐 Testing Login API...\n');
    
    // Try different endpoints
    const endpoints = [
        'http://localhost:5000/api/auth/login',
        'http://localhost:3000/api/auth/login',
        'http://127.0.0.1:5000/api/auth/login'
    ];

    const loginData = JSON.stringify({
        user_id: '8921135339',
        password: 'Welcome@123'
    });

    // Test first endpoint that responds
    for (const endpoint of endpoints) {
        console.log(`Testing: ${endpoint}`);
        try {
            const url = new URL(endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || 80,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(loginData)
                },
                timeout: 3000
            };

            const response = await new Promise((resolve, reject) => {
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data
                    }));
                });
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
                req.write(loginData);
                req.end();
            });

            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${response.body}`);
            console.log();
            
            if (response.status !== 404) {
                break; // Found working endpoint
            }
        } catch (err) {
            console.log(`   ❌ Error: ${err.message}\n`);
        }
    }
};

testLogin();
