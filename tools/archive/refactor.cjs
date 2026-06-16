const fs = require('fs');

let code = fs.readFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', 'utf8');

// Replace H3 to H2 for panel titles
code = code.replace(/<h3 className="panel-title([^"]*)">/g, '<h2 className="panel-title$1">');
// Note: We'll have to manually fix closing </h2> in the file because it's hard to replace exactly the matching ones. Actually, the easiest way is to just replace all </h3> with </h2>. 
// Let's see if there are any <h3 that shouldn't be changed.
// DailyReport.jsx has `<h3>Add Credit...` which is inside a modal. It can stay as h3 or become h2. Let's just convert all h3 to h2.
code = code.replace(/<h3/g, '<h2');
code = code.replace(/<\/h3>/g, '</h2>');

// Add H1 for the page title
// We know there's a div containing the controls. 
// "dr-controls-date" is there. Let's prepend the controls container with an H1.
code = code.replace(
    /<div className="stack-lg">\s*{([^}]*)}\s*<div className="dr-tab-bar">/g, 
    `<div className="stack-lg">
    <header className="dr-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h1>Daily Report</h1>
        {/* Controls can go here or remain where they are */}
    </header>
    {$1}
    <div className="dr-tab-bar">`
);

// Add labels to Date Input
code = code.replace(
    /<div className="dr-controls-date">\s*<Calendar size=\{15\} \/>\s*<input type="date" className="input-field dr-controls-date-input" value=\{reportDate\}\s*onChange=\{\(e\) => setReportDate\(e\.target\.value\)\}\s*\/>\s*<\/div>/g,
    `<div className="dr-controls-date">
    <label htmlFor="report-date" style={{display:'flex', alignItems:'center', gap:'8px'}}>
        <Calendar size={15} />
        <span className="sr-only">Select Date</span>
    </label>
    <input id="report-date" type="date" className="input-field dr-controls-date-input" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
</div>`
);

// We need to add Suspense for PDFExport
code = code.replace(
    /<button className="btn btn-primary btn-sm dr-pdf-btn" onClick=\{generatePDF\} title="Download PDF">\s*<FileText size=\{15\} \/> PDF\s*<\/button>/g,
    `<React.Suspense fallback={<button className="btn btn-primary btn-sm dr-pdf-btn" disabled><FileText size={15} /> Loading...</button>}>
        <PDFExport
            branchName={branchName}
            reportDate={reportDate}
            offsetData={offsetData}
            laserData={laserData}
            otherData={otherData}
            openingBalances={openingBalances}
            creditTotals={creditTotals}
            creditTransactions={creditTransactions}
            attendanceData={attendanceData}
            isFrontOffice={isFrontOffice}
            user={user}
            branches={branches}
        />
    </React.Suspense>`
);

// Change tr--clickable divs to buttons, or add role/tabIndex.
// Let's add tabIndex=0 and onKeyDown to the tr
code = code.replace(
    /<tr className=\{hasLines \? 'entry-table tr--clickable' : ''\} onClick=\{hasLines \? \(\) => toggleExpand\(entry\.id\) : undefined\}>/g,
    `<tr className={hasLines ? 'entry-table tr--clickable' : ''} onClick={hasLines ? () => toggleExpand(entry.id) : undefined} role={hasLines ? "button" : "row"} tabIndex={hasLines ? 0 : undefined} onKeyDown={hasLines ? (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } } : undefined}>`
);

fs.writeFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', code);
console.log('Transform complete');
