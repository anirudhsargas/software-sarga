const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const keys = envContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim());
  console.log('Environment variable keys configured:', keys);
} catch (err) {
  console.error(err);
}
process.exit(0);
