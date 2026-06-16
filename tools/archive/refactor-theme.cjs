const fs = require('fs');
const path = require('path');

const LIGHT = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  surfaceHover: '#E2E8F0',
  card: '#FFFFFF',
  border: '#CBD5E1',
  divider: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  input: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputFocus: '#2563EB',
  sidebar: '#FFFFFF',
  header: '#FFFFFF',
  tableHeader: '#F8FAFC',
  tableRow: '#FFFFFF',
  overlay: 'rgba(15,23,42,.5)',
  shadow: 'rgba(0,0,0,.08)',
  icon: '#475569',
  disabled: '#94A3B8'
};

const hexToRgb = (hex) => {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    const match = hex.match(/\d+(\.\d+)?/g);
    if (match && match.length >= 3) {
      return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
    }
    return { r: 0, g: 0, b: 0 };
  }
  let c = hex.substring(1).split('');
  if(c.length === 3){
      c= [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c= '0x'+c.join('');
  return { r: (c>>16)&255, g: (c>>8)&255, b: c&255 };
};

const tokens = Object.entries(LIGHT).map(([key, value]) => ({
  key,
  rgb: hexToRgb(value),
  value
}));

const getClosestToken = (colorStr) => {
  const rgb = hexToRgb(colorStr);
  let closest = tokens[0];
  let minDistance = Infinity;

  for (const token of tokens) {
    const d = Math.pow(rgb.r - token.rgb.r, 2) + Math.pow(rgb.g - token.rgb.g, 2) + Math.pow(rgb.b - token.rgb.b, 2);
    if (d < minDistance) {
      minDistance = d;
      closest = token;
    }
  }
  return closest.key;
};

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.jsx') || file.endsWith('.css') || file.endsWith('.js')) {
        results.push(file);
      }
    }
  });
  return results;
};

const files = walk(path.join(__dirname, 'src'));

let replacedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  if (file.endsWith('.css')) {
    // Replace hex and rgb/rgba in css files with var(--color-*)
    content = content.replace(/(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/g, (match) => {
      // Don't replace variables or urls
      if (originalContent.substring(Math.max(0, originalContent.indexOf(match) - 10), originalContent.indexOf(match)).includes('var(')) return match;
      if (originalContent.substring(Math.max(0, originalContent.indexOf(match) - 10), originalContent.indexOf(match)).includes('url(')) return match;
      
      const token = getClosestToken(match);
      replacedCount++;
      return `var(--color-${token})`;
    });
  } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
    // In jsx, we mostly care about inline styles for the moment, but let's replace string literals matching colors
    content = content.replace(/['"](#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))['"]/g, (match, p1) => {
      const token = getClosestToken(p1);
      replacedCount++;
      // If it looks like it's inside style={{ color: '#fff' }} we should ideally import theme. 
      // This is a naive replacement to string "var(--color-TOKEN)" which actually works in React styles too!
      // React inline styles support CSS variables: style={{ color: 'var(--color-primary)' }}
      return `'var(--color-${token})'`;
    });
    
    // Replace some generic tailwind-like classes they might have used occasionally
    content = content.replace(/['"]text-gray-500['"]/g, "'text-muted'");
    content = content.replace(/['"]bg-black['"]/g, "'bg-surface'");
    content = content.replace(/['"]bg-white['"]/g, "'bg-surface'");
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

console.log(`Replaced ${replacedCount} color instances.`);
