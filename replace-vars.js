const fs = require('fs');
const path = require('path');

const dir = 'd:/software sarga/client/src';

const map = {
  '--color-background': '--background',
  '--color-surface': '--card',
  '--color-surfaceSecondary': '--secondary',
  '--color-surfaceHover': '--secondary',
  '--color-text': '--foreground',
  '--color-textSecondary': '--muted-foreground',
  '--color-textMuted': '--muted-foreground',
  '--color-border': '--border',
  '--color-primary': '--primary',
  '--color-primaryHover': '--primary',
  '--color-success': '--success',
  '--color-warning': '--warning',
  '--color-danger': '--destructive',
  '--color-info': '--accent',
  '--color-input': '--secondary',
  '--color-inputBorder': '--border',
  '--color-inputFocus': '--ring',
  '--color-sidebar': '--background',
  '--color-header': '--card',
  '--color-tableHeader': '--secondary',
  '--color-tableRow': '--background',
  '--color-overlay': 'rgba(0, 0, 0, 0.5)',
  '--color-shadow': 'var(--shadow-sm)', // index.css has --shadow-sm
  '--color-icon': '--muted-foreground',
  '--color-disabled': '--muted-foreground'
};

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.css') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      for (const [key, value] of Object.entries(map)) {
        const regex = new RegExp(`var\\(${key}\\)`, 'g');
        if (regex.test(content)) {
          const replacement = value.startsWith('--') ? `var(${value})` : value;
          content = content.replace(regex, replacement);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDir(dir);
console.log('Done mapping CSS variables.');
