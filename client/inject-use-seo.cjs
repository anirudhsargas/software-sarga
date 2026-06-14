const fs = require('fs');
const path = require('path');

const pagesDir = 'D:/software sarga/client/src/pages';
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

function formatTitle(filename) {
    const base = filename.replace('.jsx', '');
    return base.replace(/([A-Z])/g, ' $1').trim();
}

for (const file of files) {
    const filePath = path.join(pagesDir, file);
    let code = fs.readFileSync(filePath, 'utf8');

    // Skip if already injected
    if (code.includes('useSEO')) continue;

    // Add import
    const importMatch = code.match(/import .*?;?\n/);
    if (importMatch) {
        code = code.replace(importMatch[0], importMatch[0] + "import { useSEO } from '../hooks/useSEO';\n");
    } else {
        code = "import { useSEO } from '../hooks/useSEO';\n" + code;
    }

    // Find main component definition
    // Usually: const PageName = () => {  OR const PageName = ({props}) => { OR function PageName() {
    
    const baseName = file.replace('.jsx', '');
    const title = formatTitle(baseName);

    const regexArrow = new RegExp(`const\\s+${baseName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`);
    const regexFunc = new RegExp(`function\\s+${baseName}\\s*\\([^)]*\\)\\s*\\{`);
    
    if (regexArrow.test(code)) {
        code = code.replace(regexArrow, match => `${match}\n    useSEO('${title}');\n`);
    } else if (regexFunc.test(code)) {
        code = code.replace(regexFunc, match => `${match}\n    useSEO('${title}');\n`);
    } else {
        // Fallback: Just inject after the first standard export / functional component definition
        const genericArrow = /const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*\([^)]*\)\s*=>\s*\{/;
        if (genericArrow.test(code)) {
             code = code.replace(genericArrow, match => `${match}\n    useSEO('${title}');\n`);
        }
    }

    fs.writeFileSync(filePath, code);
}
console.log("useSEO injected successfully.");
