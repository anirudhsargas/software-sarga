const axios = require('axios');
(async () => {
  try {
    const tokenRes = await axios.get('http://localhost:3000/api/dev/token');
    const token = tokenRes.data.token;
    const vendorRes = await axios.get('http://localhost:3000/api/vendors/2', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(JSON.stringify(vendorRes.data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
    process.exit(1);
  }
})();
