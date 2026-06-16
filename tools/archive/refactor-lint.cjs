const fs = require('fs');
let code = fs.readFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', 'utf8');

// Wrap creditTotals in useMemo
code = code.replace(
    /const creditTotals = \(creditTransactions \|\| \[\]\)\.reduce\(\(acc, t\) => \{[\s\S]*?\}, \{ in: 0, out: 0 \}\);/m,
    `const creditTotals = React.useMemo(() => (creditTransactions || []).reduce((acc, t) => {
        if (!t) return acc;
        const typ = String(t.transaction_type || '').toLowerCase();
        if (typ.includes('in')) acc.in += Number(t.amount || 0);
        else acc.out += Number(t.amount || 0);
        return acc;
    }, { in: 0, out: 0 }), [creditTransactions]);`
);

// Remove formatDateDisplay
code = code.replace(/const formatDateDisplay = \(dateStr\) => \{[\s\S]*?\};\n/, '');

// Remove manualRefresh
code = code.replace(/const manualRefresh = \(\) => \{ loadAllData\(\); \};\n/, '');

// Remove catch (err) -> catch
code = code.replace(/catch \(err\)/g, 'catch');

// Remove catch (error) -> catch
code = code.replace(/catch \(error\)/g, 'catch');

fs.writeFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', code);
console.log('Lint fixes applied');
