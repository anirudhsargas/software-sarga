const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
const widgetsPath = 'D:/software sarga/client/src/pages/SummaryWidgets.jsx';

const code = fs.readFileSync(summaryPath, 'utf8');

const startMarker = "{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}";
const endMarker = "{activeTab === 'ai-monitoring' && (";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

// The part from section 1.5 to the end of overview tab
// We need to cut right before `</>` and `)}` that precede `activeTab === 'ai-monitoring'`
let widgetsCodeStr = code.substring(startIndex, endIndex);

// It currently ends with:
//            </Suspense>
//        </>
//    )}
// We should remove the `</>` and `)}` at the end
const closingTagsIdx = widgetsCodeStr.lastIndexOf('</>');
if (closingTagsIdx !== -1) {
    widgetsCodeStr = widgetsCodeStr.substring(0, closingTagsIdx).trim();
}

const widgetsFileContent = `
import React, { Suspense } from 'react';
import { ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, IndianRupee, TrendingUp, BarChart3, Activity, ClipboardList, Printer, Wallet, AlertTriangle, UserCheck, Users, Loader2 } from 'lucide-react';
const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));

const SummaryWidgets = React.memo(({ statsToday, statsOverall, navigate, fmt, fmtNum, getStatusColor, filters }) => {
    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];

    return (
        <>
            ${widgetsCodeStr}
        </>
    );
});

const forecastSkeletonHeights = ['38%', '54%', '46%', '70%', '58%', '82%', '64%'];

const OrderForecastWidgetSkeleton = () => (
    <section className="summary-section animate-fade-up" style={{ marginTop: 24 }}>
        <div className="summary-section__header">
            <div>
                <div className="skeleton" style={{ width: 220, height: 16, borderRadius: 4, background: 'var(--border, #e5e7eb)' }} />
                <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 4, background: 'var(--border, #e5e7eb)', marginTop: 8 }} />
            </div>
        </div>
        <div style={{ display: 'flex', gap: 8, height: 180, alignItems: 'flex-end', padding: '16px 0' }}>
            {forecastSkeletonHeights.map((height, i) => (
                <div key={i} className="skeleton" style={{
                    flex: 1,
                    borderRadius: 4,
                    background: 'var(--border, #e5e7eb)',
                    height,
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: \`\${i * 0.1}s\`,
                }} />
            ))}
        </div>
    </section>
);

export default SummaryWidgets;
`;

fs.writeFileSync(widgetsPath, widgetsFileContent);

// Now update Summary.jsx
let newSummary = code;

// 1. Remove the extracted part
newSummary = newSummary.replace(widgetsCodeStr, `
                    <Suspense fallback={<div className="skeleton-wrapper"><div className="skeleton" style={{height: 400, marginTop: 24, borderRadius: 8}}></div></div>}>
                        <SummaryWidgets 
                            statsToday={statsToday} 
                            statsOverall={statsOverall} 
                            navigate={navigate} 
                            fmt={fmt} 
                            fmtNum={fmtNum} 
                            getStatusColor={getStatusColor} 
                            filters={filters}
                        />
                    </Suspense>
`);

// 2. Remove OrderForecastWidgetSkeleton from Summary.jsx
const skeletonMarkerStart = "const forecastSkeletonHeights";
const skeletonMarkerEnd = ");\n\nexport default Summary;";
const skelStartIdx = newSummary.indexOf(skeletonMarkerStart);
const skelEndIdx = newSummary.indexOf("export default Summary;");
if (skelStartIdx !== -1 && skelEndIdx !== -1) {
    newSummary = newSummary.substring(0, skelStartIdx) + newSummary.substring(skelEndIdx);
}

// 3. Remove blocking loading return
const loadingReturnRegex = /if \(loading && !statsToday && !statsOverall\) \{[\s\S]*?\}\n\n/;
newSummary = newSummary.replace(loadingReturnRegex, '');

// 4. Update imports
newSummary = newSummary.replace(
    "const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));",
    "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));"
);

// 5. Wrap fetch with startTransition and useCallback
// Find fetchStatsSplit
const fetchRegex = /const fetchStatsSplit = async \(\) => \{[\s\S]*?\}\n\n\s*const fmt/;
const fetchMatch = newSummary.match(fetchRegex);
if (fetchMatch) {
    let newFetch = fetchMatch[0];
    newFetch = newFetch.replace("const fetchStatsSplit = async () => {", "const fetchStatsSplit = React.useCallback(async () => {");
    newFetch = newFetch.replace(/setStatsToday\(todayRes\.data\);\n\s*setStatsOverall\(overallRes\.data\);/, `
            React.startTransition(() => {
                setStatsToday(todayRes.data);
                setStatsOverall(overallRes.data);
            });
    `);
    newFetch = newFetch.replace("setLoading(true);", "");
    newFetch = newFetch.replace("setLoading(false);", "");
    newFetch = newFetch.replace(/finally\s*\{[\s\S]*?\}/, "");
    newFetch = newFetch.replace(/\}\n\n\s*const fmt/, "}, [filters.branch_id]);\n\n    const fmt");
    
    newSummary = newSummary.replace(fetchMatch[0], newFetch);
}

// 6. Remove loading state variable
newSummary = newSummary.replace("const [loading, setLoading] = useState(true);\n    ", "");

fs.writeFileSync(summaryPath, newSummary);
console.log("Success");
