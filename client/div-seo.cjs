const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.jsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('D:/software sarga/client/src');
let modifiedCount = 0;

for (const file of files) {
    let code = fs.readFileSync(file, 'utf8');
    let original = code;

    // We look for <div ... onClick={...} ... > and ensure role="button" tabIndex={0}
    // Simple regex: <div ([^>]*onClick=[^>]+)>
    // Then we replace if missing.
    
    code = code.replace(/<div\s+([^>]*onClick=[^>]+)>/g, (match, attrs) => {
        let newAttrs = attrs;
        if (!newAttrs.includes('role="button"')) {
            newAttrs = `role="button" tabIndex={0} ${newAttrs}`;
        }
        return `<div ${newAttrs}>`;
    });

    // Also look for <div onClick={...} ...> where onClick is first
    code = code.replace(/<div\s+(onClick=[^>]+)>/g, (match, attrs) => {
        let newAttrs = attrs;
        if (!newAttrs.includes('role="button"')) {
            newAttrs = `role="button" tabIndex={0} ${newAttrs}`;
        }
        return `<div ${newAttrs}>`;
    });

    if (code !== original) {
        fs.writeFileSync(file, code);
        modifiedCount++;
    }
}
console.log(`Modified div elements in ${modifiedCount} files.`);
