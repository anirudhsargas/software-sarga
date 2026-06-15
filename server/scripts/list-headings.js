const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'FrontOffice.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('=== Headings in FrontOffice.jsx ===');
lines.forEach((line, idx) => {
  if (/<h[1-6]/i.test(line)) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
