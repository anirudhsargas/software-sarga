const fs = require('fs');

function formatTitle(path) {
    if (!path || path === '/' || path === '') return 'Dashboard';
    const clean = path.replace(/[\/\:\*]/g, ' ').replace(/-/g, ' ').trim();
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function processFile(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Add import if not exists
    if (!code.includes('import SEO')) {
        const importMatch = code.match(/import .*?;?\n/);
        if (importMatch) {
            code = code.replace(importMatch[0], importMatch[0] + "import SEO from '../components/SEO';\n");
        } else {
            code = "import SEO from '../components/SEO';\n" + code;
        }
    }

    // Replace <Route path="..." element={<Comp />} /> with SEO wrapped
    // But we have multi-line routes.
    // It's safer to just inject it directly. Since this is complex regex, let's just do it manually for the top-level routes or use a simple replacement.
    
    const routeRegex = /<Route\s+([^>]*)path=(['"])(.*?)\2([^>]*)element=\{([^}]*)\}\s*\/>/g;
    
    code = code.replace(routeRegex, (match, p1, quote, path, p4, element) => {
        // Skip if already wrapped
        if (element.includes('<SEO')) return match;
        
        let title = formatTitle(path);
        // Special cases
        if (path === 'customers/:id') title = 'Customer Details';
        if (path === 'jobs/:id') title = 'Job Detail';
        if (path === 'employee/:staffId') title = 'Employee Detail';
        
        const newElement = `<><SEO title="${title}" />${element}</>`;
        return `<Route ${p1}path="${path}"${p4}element={${newElement}} />`;
    });

    // Also handle routes that have nested routes: <Route path="sales" element={<SalesLayout />}>
    const layoutRegex = /<Route\s+([^>]*)path=(['"])(.*?)\2([^>]*)element=\{([^}]*)\}\s*>/g;
    code = code.replace(layoutRegex, (match, p1, quote, path, p4, element) => {
        if (element.includes('<SEO')) return match;
        const title = formatTitle(path);
        const newElement = `<><SEO title="${title}" />${element}</>`;
        return `<Route ${p1}path="${path}"${p4}element={${newElement}}>`;
    });

    fs.writeFileSync(filePath, code);
}

processFile('D:/software sarga/client/src/App.jsx');
processFile('D:/software sarga/client/src/pages/Dashboard.jsx');

console.log("Injected SEO into routes");
