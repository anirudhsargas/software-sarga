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
for (const file of files) {
    let code = fs.readFileSync(file, 'utf8');
    let original = code;

    // Fix Duplicate loading
    // Find <img loading="lazy" ... loading={loading}
    code = code.replace(/<img loading="lazy"([^>]*)loading=\{loading\}/g, '<img$1loading={loading}');
    code = code.replace(/<img([^>]*)loading=\{loading\}([^>]*)loading="lazy"/g, '<img$1loading={loading}$2');
    
    // Fix Duplicate role and tabIndex
    // Remove the injected ones if there are two
    code = code.replace(/role="button"\s+tabIndex=\{0\}\s+(.*?)\s+role="button"\s+tabIndex=\{0\}/g, '$1 role="button" tabIndex={0}');
    code = code.replace(/role="button"\s+tabIndex=\{0\}\s+(.*?)\s+role="tab"/g, '$1 role="tab"');

    // Also just a general cleanup for `role="button" tabIndex={0}` duplicate
    code = code.replace(/role="button"\s+tabIndex=\{0\}\s+([^>]*?)\s+role="button"\s+tabIndex=\{0\}/g, 'role="button" tabIndex={0} $1');

    if (code !== original) {
        fs.writeFileSync(file, code);
    }
}
console.log("Cleanup complete");
