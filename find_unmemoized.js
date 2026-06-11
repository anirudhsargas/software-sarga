const fs = require('fs');
const path = require('path');
const dir = 'd:\\software sarga\\client\\src\\components';

function checkDir(directory) {
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            checkDir(fullPath);
        } else if (fullPath.endsWith('.jsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (!content.includes('React.memo(')) {
                console.log(fullPath);
            }
        }
    }
}

checkDir(dir);
