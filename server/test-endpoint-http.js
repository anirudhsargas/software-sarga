const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/daily-report/previous-closing?date=2026-04-08',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer dummy-token-for-testing'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('\n=== /api/daily-report/previous-closing?date=2026-04-08 ===');
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('\nResponse:');
      console.log(JSON.stringify(json, null, 2));
      
      if (json.Laser) {
        console.log('\n=== Analysis ===');
        console.log('Laser value returned:', json.Laser);
        if (json.Laser === 4729) {
          console.log('✅ CORRECT! Expected 4729');
        } else {
          console.log('❌ WRONG! Expected 4729 but got', json.Laser);
        }
      }
    } catch (e) {
      console.log('Error parsing response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
