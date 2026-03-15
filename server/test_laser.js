const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
    throw new Error('JWT_SECRET is required in environment to run test_laser.js');
}

// Admin User token payload
const payload = {
    id: 1, // assuming 1 is admin or staff
    role: 'Admin',
    branch_id: 4 // match machine_id 6 branch
};

const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });

async function run() {
    try {
        console.log('Testing bulk laser job creation...');
        const jobRes = await fetch('http://localhost:5000/api/jobs/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                customer_id: null,
                order_lines: [
                    {
                        product_id: 10,
                        product_name: 'Color Laser Print Test 2',
                        quantity: 15,
                        unit_price: 10,
                        total_amount: 150,
                        category: 'LASER',
                        machine_id: 6
                    }
                ]
            })
        });

        const jobData = await jobRes.json();
        console.log('Job Create Result:', jobData);

        // Now test pulling the daily report laser-live
        console.log('\nFetching laser-live daily report...');
        const date = new Date().toISOString().split('T')[0];
        const reportRes = await fetch(`http://localhost:5000/api/daily-report/laser-live?date=${date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const reportData = await reportRes.json();
        console.log('Laser Live Report Summary:', reportData.summary);
        console.log('Laser Live Entries (Last 2):', reportData.entries ? reportData.entries.slice(-2) : []);

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
