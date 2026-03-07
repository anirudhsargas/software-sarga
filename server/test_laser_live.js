const axios = require('axios');

async function test() {
    try {
        const date = '2026-02-28';
        const url = `http://localhost:5000/api/daily-report/laser-live?date=${date}&branch_id=4`;

        // Note: I don't have a token easily handy, but I can check if the server logs an error 
        // even if it returns 401/403. However, the user is logged in.
        // I'll try to check the server logs after I trigger a request.

        console.log('Triggering request to:', url);
        const res = await axios.get(url).catch(e => e.response);
        console.log('Status:', res.status);
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
