const router = require('../routes/paperInventory');

function getLayerPath(layer) {
  if (layer.route && layer.route.path) return layer.route.path;
  if (layer.name === 'router' && layer.handle && layer.handle.stack) return '<router>';
  return layer.name || '<unknown>';
}

console.log('PaperInventory router stack:');
router.stack.forEach(l => {
  const methods = l.route ? Object.keys(l.route.methods).join(',') : '';
  console.log(' ', methods.padEnd(6), getLayerPath(l));
  if (l.route && l.route.stack) {
    l.route.stack.forEach(rs => console.log('    ->', rs.method));
  }
});

process.exit(0);
