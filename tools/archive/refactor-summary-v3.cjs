const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
const code = fs.readFileSync(summaryPath, 'utf8');

let newSummary = code;

// 1. Remove Section 1.5 to end of Overview
const startMarker = "{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}";
const endMarker = "{activeTab === 'ai-monitoring' && (";
const startIdx = newSummary.indexOf(startMarker);
const endIdx = newSummary.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    let toRemove = newSummary.substring(startIdx, endIdx);
    const lastTagIdx = toRemove.lastIndexOf('</>');
    toRemove = toRemove.substring(0, lastTagIdx + 3) + "\n            )}\n\n            ";
    
    const replacement = `
                    {/* ─── Deferred Below-The-Fold Widgets ─── */}
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
                </>
            )}

            `;
    newSummary = newSummary.replace(toRemove, replacement);
}

// 2. Remove OrderForecastWidgetSkeleton
const skelStart = newSummary.indexOf("const forecastSkeletonHeights");
const skelEnd = newSummary.indexOf("export default Summary;");
if (skelStart !== -1 && skelEnd !== -1) {
    newSummary = newSummary.substring(0, skelStart) + newSummary.substring(skelEnd);
}

// 3. Remove loading block entirely
newSummary = newSummary.replace(/if \(loading && !statsToday && !statsOverall\) \{[\s\S]*?\}\n\n/, "");
newSummary = newSummary.replace(/if \(loading && !statsToday && !statsOverall\) \{[\s\S]*?\}\n/, "");

// 4. Update imports
newSummary = newSummary.replace(
    "const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));",
    "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));"
);

// 5. Wrap fetch in startTransition
newSummary = newSummary.replace("const fetchStatsSplit = async () => {", "const fetchStatsSplit = React.useCallback(async () => {");
newSummary = newSummary.replace(/setStatsToday\(todayRes\.data\);\s*setStatsOverall\(overallRes\.data\);/, `
            React.startTransition(() => {
                setStatsToday(todayRes.data);
                setStatsOverall(overallRes.data);
            });
    `);
newSummary = newSummary.replace("setLoading(true);", "");
newSummary = newSummary.replace(/finally\s*\{[\s\S]*?\}/, "");
newSummary = newSummary.replace("}, [filters.branch_id]);", ""); // clean if any
newSummary = newSummary.replace(/\}\n\n\s*const fmt/, "}, [filters.branch_id]);\n\n    const fmt");

// 6. Remove unused constants
newSummary = newSummary.replace("const [loading, setLoading] = useState(true);\n    ", "");
newSummary = newSummary.replace("const lowStockItems = statsOverall?.low_stock || [];\n", "");
newSummary = newSummary.replace("const topCustomers = statsOverall?.top_customers || [];\n", "");
newSummary = newSummary.replace("const staffProd = statsOverall?.staff_productivity || [];\n", "");

fs.writeFileSync(summaryPath, newSummary);
console.log("Success");
