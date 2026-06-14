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

    // Add loading="lazy" to all <img
    code = code.replace(/<img([^>]+)>/g, (match, p1) => {
        let newP1 = p1;
        if (!newP1.includes('loading="lazy"')) {
            newP1 = ` loading="lazy"${newP1}`;
        }
        if (!newP1.includes('alt=')) {
            newP1 = `${newP1} alt=""`;
        }
        return `<img${newP1}>`;
    });

    if (code !== original) {
        fs.writeFileSync(file, code);
        modifiedCount++;
    }
}
console.log(`Modified images in ${modifiedCount} files.`);
