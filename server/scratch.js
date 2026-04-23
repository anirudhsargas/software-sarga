const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 1, role: 'Admin' }, 'sarga1234', { expiresIn: '1d' });

axios.get('http://localhost:5000/api/inventory?limit=5', {
    headers: { Authorization: `Bearer ${token}` }
}).then(res => {
    console.log(JSON.stringify(res.data, null, 2));
}).catch(err => {
    console.error(err.message);
});
