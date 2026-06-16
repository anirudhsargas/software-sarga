const fs = require('fs');

const cssPath = 'D:/software sarga/client/src/pages/ExpenseManager.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Insert variables at the top
const newVars = `
:root {
  --em-text-primary: #595959;
  --em-text-secondary: #767676;
  --em-btn-text: #404040;
  --em-tab-active: #1f2937;
  --em-tab-inactive: #6b7280;
}

/* Accessibility Focus Rings */
button:focus-visible,
input:focus-visible,
select:focus-visible,
a:focus-visible,
[role="button"]:focus-visible,
[tabindex]:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
}

/* Sticky Elements */
.em-header, .em-filter-bar, .em-tabs {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg, #fff);
}
.em-tabs {
    top: 60px; /* Adjust according to header height */
}

/* Data Table Sticky Headers */
.em-table th {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--surface, #fff);
}

/* Fix low contrast colors */
.em-tab {
    color: var(--em-tab-inactive);
}
.em-tab--active {
    color: var(--em-tab-active);
    font-weight: 600;
}
.btn-ghost {
    color: var(--em-btn-text);
}
`;

fs.writeFileSync(cssPath, newVars + '\n' + css);
console.log('ExpenseManager.css updated');
