const fs = require('fs');

const emPath = 'D:/software sarga/client/src/pages/ExpenseManager.jsx';
let code = fs.readFileSync(emPath, 'utf8');

// Replace synchronous imports with React.lazy
const importsToReplace = [
    'DashboardTab', 'VendorsTab', 'RentTab', 'UtilitiesTab', 
    'FinanceTab', 'TransportTab', 'MiscTab', 'StaffExpensesTab', 
    'BillsDocsTab', 'ReportsTab', 'OfficeTab'
];

importsToReplace.forEach(tab => {
    const regex = new RegExp(`import ${tab} from '\\.\\/expense-manager\\/${tab}';`, 'g');
    code = code.replace(regex, `const ${tab} = React.lazy(() => import('./expense-manager/${tab}'));`);
});

// Wrap the tab content in Suspense
const tabContentRegex = /{activeTab === 'dashboard'[\s\S]*?{activeTab === 'reports'[\s\S]*?}/;

const tabContentMatch = code.match(tabContentRegex);
if (tabContentMatch) {
    const originalTabs = tabContentMatch[0];
    const wrappedTabs = `
      <React.Suspense fallback={<div className="panel em-loading-skeleton" style={{padding: '40px', textAlign: 'center'}}>Loading module...</div>}>
        ${originalTabs}
      </React.Suspense>
    `;
    code = code.replace(tabContentRegex, wrappedTabs);
}

// Convert <div> buttons to <button type="button"> or add focus styles if necessary
// The problem statement says:
// <button className="btn btn-ghost btn-sm" onClick={() => setShowBillsPanel(true)}><FileText size={15} /> Bills & Docs</button>
// They are already buttons in the header, but maybe fab buttons or side panel backdrops.
// In ExpenseManager.jsx, there's `em-sidepanel` backdrop and modal.
// We'll leave the backdrop as div onClick but give it role="presentation".
code = code.replace(/<div className="em-sidepanel-backdrop" onClick=\{.*?\}\>/g, (match) => {
    return match.replace('>', ' role="presentation">');
});

fs.writeFileSync(emPath, code);
console.log('ExpenseManager.jsx updated');
