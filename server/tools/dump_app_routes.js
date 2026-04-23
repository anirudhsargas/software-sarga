process.env.NODE_ENV = 'test';
require('dotenv').config({ path: './.env' });
const app = require('../index');

const routes = [];
app._router.stack.forEach((layer) => {
  if (layer.route && layer.route.path) {
    const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
    routes.push(`${methods} ${layer.route.path}`);
  } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
    // attempt to get mount path
    const mount = layer.regexp && layer.regexp.source ? layer.regexp.source : '<router>';
    layer.handle.stack.forEach((l) => {
      if (l.route && l.route.path) {
        const methods = Object.keys(l.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${mount} -> ${l.route.path}`);
      }
    });
  }
});

console.log('Registered routes:');
routes.forEach(r => console.log(' ', r));
process.exit(0);
