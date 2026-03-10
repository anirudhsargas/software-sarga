const axios = require('axios');

async function listRoutes() {
    try {
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            user_id: '8547432287',
            password: 'admin'
        });
        const token = loginRes.data.token;

        // Try different route variations
        const routes = [
            '/api/inventory',
            '/api/inventory/',
            '/api/inventory/qr-diagnostic/MYS-POLO-L',
            '/api/inventory/by-sku/MYS-POLO-L'
        ];

        for (const route of routes) {
            try {
                const res = await axios.get(`http://localhost:5000${route}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                console.log(`✓ ${route}`);
            } catch (err) {
                console.log(`✗ ${route} - ${err.response?.status} ${err.response?.statusText || err.message}`);
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

listRoutes();
