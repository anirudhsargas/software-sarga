const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'server', 'routes');
const files = fs.readdirSync(routesDir);

files.forEach(file => {
    if (!file.endsWith('.js')) return;
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix common mangled patterns
    // 1. Double closing braces or trailings
    content = content.replace(/res\.status\(500\)\.json\({ message: 'Database error'.*?}\);.*?\n/g, "res.status(500).json({ message: 'Database error', error: err.message });\n");

    // 2. Any other mangled Database error lines
    // This is more aggressive - it looks for the start of the pattern until the end of the line
    const lines = content.split('\n');
    const fixedLines = lines.map(line => {
        if (line.includes("res.status(500).json({ message: 'Database error'")) {
            return line.replace(/res\.status\(500\)\.json\({ message: 'Database error'.*$/, "res.status(500).json({ message: 'Database error', error: err.message });");
        }
        return line;
    });

    fs.writeFileSync(filePath, fixedLines.join('\n'), 'utf8');
    console.log(`Fixed ${file}`);
});
