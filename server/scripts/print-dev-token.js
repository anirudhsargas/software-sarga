const axios = require('axios');
(async () => {
  try {
    const tokenRes = await axios.get('http://localhost:3000/api/dev/token');
    console.log('TOKEN:' + tokenRes.data.token);
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
