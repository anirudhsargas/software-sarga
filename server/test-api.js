const http = require('http');

function testAPI() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/customer-payments/pending-verification?page=1&limit=20&status=Pending',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer invalid-token',
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS:`, JSON.stringify(res.headers));
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('BODY:');
      console.log(data);
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error(`PROBLEM WITH REQUEST: ${e.message}`);
    process.exit(1);
  });

  req.end();
}

testAPI();
