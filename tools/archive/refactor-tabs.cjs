const fs = require('fs');
const path = require('path');

const dir = 'D:/software sarga/client/src/pages/expense-manager/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    let code = fs.readFileSync(path.join(dir, file), 'utf8');
    let originalCode = code;

    // 1. Memoize export if not already memoized
    const exportRegex = /^export default (\w+);$/m;
    const match = code.match(exportRegex);
    if (match && match[1] !== 'React' && !code.includes('React.memo(' + match[1])) {
        if (!code.includes("import React")) {
            code = "import React from 'react';\n" + code;
        }
        code = code.replace(exportRegex, `export default React.memo(${match[1]});`);
    }

    // 2. Wrap <input type="date"> with label
    code = code.replace(/<input([^>]*type="date"[^>]*)>/g, (match, p1) => {
        if (p1.includes('id=')) return match; // Already handled or has ID
        const id = `date-${Math.random().toString(36).substring(7)}`;
        return `
        <label htmlFor="${id}" className="sr-only">Select Date</label>
        <input id="${id}" ${p1}>`;
    });

    // 3. <select> -> add aria-label if not present
    code = code.replace(/<select([^>]*)>/g, (match, p1) => {
        if (!p1.includes('aria-label') && !p1.includes('id=')) {
            return `<select aria-label="Select option" ${p1}>`;
        }
        return match;
    });

    // 4. Convert <div ... onClick={...}> to have role="button" and tabIndex={0}
    code = code.replace(/<div([^>]*onClick=[^>]*)>/g, (match, p1) => {
        if (!p1.includes('role=') && !p1.includes('tabIndex=')) {
            // we will inject role="button" tabIndex={0}
            return `<div role="button" tabIndex={0} ${p1}>`;
        }
        return match;
    });

    if (code !== originalCode) {
        fs.writeFileSync(path.join(dir, file), code);
        console.log(`Updated ${file}`);
    }
});
