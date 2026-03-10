const axios = require('axios');

async function testGanging() {
    try {
        console.log("1. Logging in as Admin...");
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            user_id: '8547432287',
            password: '123'
        });

        const token = loginRes.data.token;
        console.log("Login successful. Token acquired.");

        const headers = { Authorization: `Bearer ${token}` };

        console.log("2. Fetching pending offset jobs...");
        const jobsRes = await axios.get('http://localhost:5000/api/jobs/offset-pending', { headers });
        console.log(`Found ${jobsRes.data.length} pending offset jobs.`);

        if (jobsRes.data.length === 0) {
            console.log("3. Creating dummy offset jobs for testing...");
            await axios.post('http://localhost:5000/api/jobs/bulk', {
                customer_id: null,
                order_lines: [
                    { job_name: 'Test Wedding Card A5', quantity: 1500, unit_price: 10, total_amount: 15000, category: 'Offset' },
                    { job_name: 'Test Poster A4', quantity: 500, unit_price: 20, total_amount: 10000, category: 'Offset' },
                    { job_name: 'Test Big Poster A3', quantity: 200, unit_price: 40, total_amount: 8000, category: 'Offset' }
                ]
            }, { headers });

            console.log("Dummy jobs created. Fetching again...");
            const jobsRes2 = await axios.get('http://localhost:5000/api/jobs/offset-pending', { headers });
            console.log(`Now found ${jobsRes2.data.length} pending offset jobs.`);
            console.log(jobsRes2.data.map(j => `${j.job_number}: ${j.job_name} (Qty: ${j.quantity})`));
        } else {
            console.log(jobsRes.data.map(j => `${j.job_number}: ${j.job_name} (Qty: ${j.quantity})`));
        }

        console.log("Backend endpoints are working correctly.");

    } catch (error) {
        console.error("Test failed:", error.response ? error.response.data : error.message);
    }
}

testGanging();
