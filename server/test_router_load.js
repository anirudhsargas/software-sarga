const express = require('express');
const app = express();

// Try loading the inventory router manually
try {
    const inventoryRouter = require('./routes/inventory');
    console.log('✓ Inventory router loaded successfully');
    
    // Check if it's a proper Express router
    console.log(`  Router type: ${inventoryRouter.constructor.name}`);
    console.log(`  Has methods: ${Object.keys(inventoryRouter).filter(k => typeof inventoryRouter[k] === 'function').join(', ')}`);
    
    // Try to get some info about the routes
    if (inventoryRouter.stack) {
        const qrDiagRoutes = inventoryRouter.stack.filter(layer => 
            layer.route && layer.route.path && layer.route.path.includes('qr-diagnostic')
        );
        console.log(`  QR Diagnostic routes found: ${qrDiagRoutes.length}`);
        qrDiagRoutes.forEach(layer => {
            console.log(`    - ${Object.keys(layer.route.methods).join(',')} ${layer.route.path}`);
        });
    }
    
    // Try mounting it
    app.use('/api', inventoryRouter);
    
    // Now check what routes are available
    console.log('\n✓ Router mounted on app');
    
    // List all routes
    const routes = [];
    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            routes.push({
                path: middleware.route.path,
                methods: Object.keys(middleware.route.methods).map(m => m.toUpperCase())
            });
        } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach(handler => {
                if (handler.route) {
                    const path = `/api${handler.route.path}`;
                    const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase());
                    routes.push({ path, methods });
                }
            });
        }
    });
    
    console.log('\nAll routes for /inventory:');
    routes.filter(r => r.path.includes('inventory')).forEach(r => {
        console.log(`  ${r.methods.join('|').padEnd(8)} ${r.path}`);
    });
    
    process.exit(0);
} catch (err) {
    console.error('✗ Error loading inventory router:');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
}
