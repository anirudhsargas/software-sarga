const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testFetch() {
    try {
        // MOCK A TOKEN for user 1 (Admin)
        const token = jwt.sign(
            { id: 1, role: 'Admin', branch_id: 1, name: 'Admin Test' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

        console.log("Fetching offset-pending...");
        const res = await axios.get('http://localhost:5000/api/jobs/offset-pending', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log("Success. Status:", res.status);
        console.log("Items found:", res.data.length);

        console.log(res.data.map(d => `${d.job_number} - ${d.job_name}`).join('\n'));
    } catch (e) {
        console.error("Failed:", e.response ? e.response.status : e.message);
        if (e.response && e.response.data) console.error(e.response.data);
    }
}

testFetch();
