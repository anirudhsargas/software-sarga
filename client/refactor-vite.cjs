const fs = require('fs');

const vitePath = 'D:/software sarga/client/vite.config.js';
let config = fs.readFileSync(vitePath, 'utf8');

// The user wants:
// dashboard: ["./tabs"]
// icons: ["lucide-react"]
// reports: ["./reports"]

// We can replace the `if (id.includes('lucide-react')) { return 'vendor-ui'; }`
// Actually, `lucide-react` is already split as `vendor-ui`. Let's rename `vendor-ui` to `icons` to match user's explicit request if we want, or add dashboard.
// Let's replace the `manualChunks: (id) => { ... }` function entirely with a cleaner version:
const newManualChunks = `manualChunks: (id) => {
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('jspdf')) {
            return 'pdf-export';
          }
          if (id.includes('src/pages/expense-manager/') || id.includes('src/pages/ExpenseManager')) {
            return 'dashboard';
          }
          if (id.includes('src/pages/Reports') || id.includes('reportsTab')) {
            return 'reports';
          }
          if (id.includes('recharts')) {
            return 'charts';
          }
          if (id.includes('axios')) {
            return 'http';
          }
        },`;

config = config.replace(/manualChunks:\s*\([\s\S]*?chunkFileNames/g, newManualChunks + '\n        chunkFileNames');
fs.writeFileSync(vitePath, config);
console.log('vite.config.js updated');
