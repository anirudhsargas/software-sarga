const fs = require('fs');

let css = fs.readFileSync('D:/software sarga/client/src/pages/DailyReport.css', 'utf8');

const newStyles = `
/* Accessibility & Focus */
button:focus-visible,
input:focus-visible,
select:focus-visible,
[role="button"]:focus-visible,
[tabindex]:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

/* Sticky Headers for Tables */
.entry-table th,
.credit-list-table th,
.staff-table th {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--surface);
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Equal spacing toolbar & Sticky Top */
.dr-header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
    padding: 12px 0;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--surface-3);
}

.dr-controls-date {
    display: flex;
    align-items: center;
    gap: 12px;
}
`;

fs.appendFileSync('D:/software sarga/client/src/pages/DailyReport.css', newStyles);
console.log('CSS updated');
