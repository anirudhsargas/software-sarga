const axios = require('axios');

async function searchJobs(term) {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
        user_id: '8547432287',
        password: 'admin'
    });
    const token = loginRes.data.token;

    try {
        const res = await axios.get('http://localhost:5000/api/jobs', {
            headers: { Authorization: `Bearer ${token}` },
            params: { search: term }
        });
        console.log(`Search term: '${term}' -> ${res.data.length} results`);
        console.log(res.data.map(j => `${j.id} | ${j.job_name}`).join('\n'));
    } catch (err) {
        console.error('Error', err.response?.data || err.message);
    }
}

(async () => {
    await searchJobs('Sample');
    await searchJobs('Walk'); // maybe matches customer or job name
    await searchJobs('Test Product'); // should match by job_name
    process.exit(0);
})();