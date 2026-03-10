const https = require('https');
const http = require('http');

function testEndpoint(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log(`Response: ${data}`);
                resolve();
            });
        }).on('error', reject);
    });
}

async function runTests() {
    // Get auth token first
    const axios = require('axios');
    try {
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            user_id: '8547432287',
            password: 'admin'
        });
        const token = loginRes.data.token;
        console.log('✓ Logged in successfully');
        console.log(`Token: ${token.substring(0, 20)}...`);
        
        // Test QR diagnostic with various codes
        const testCodes = ['MYS-POLO-L', 'MYSPOLO', 'MYS-POLO-L'];
        
        for (const code of testCodes) {
            const encodedCode = encodeURIComponent(code);
            const url = `http://localhost:5000/api/inventory/qr-diagnostic/${encodedCode}`;
            console.log(`\n--- Testing: ${code} ---`);
            console.log(`URL: ${url}`);
            
            try {
                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log('Response:', JSON.stringify(res.data, null, 2));
            } catch (err) {
                console.log('Response:', JSON.stringify(err.response?.data, null, 2));
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

runTests();
