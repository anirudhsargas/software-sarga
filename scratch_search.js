const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        searchDir(fullPath, query);
      }
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Match in ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            console.log(`  L${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log("Searching for 'customerType'...");
searchDir('d:/software sarga/client/src', 'customerType');

console.log("\nSearching for 'customer_type'...");
searchDir('d:/software sarga/client/src', 'customer_type');

console.log("\nSearching for 'client_type'...");
searchDir('d:/software sarga/client/src', 'client_type');

console.log("\nSearching for select elements near customer/type...");
searchDir('d:/software sarga/client/src', 'customer');
