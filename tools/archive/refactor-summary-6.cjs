const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
let code = fs.readFileSync(summaryPath, 'utf8');

// 1. Replace the widgets
const startExtract = `{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}`;
const endExtract = `
            {activeTab === 'ai-monitoring' && (`;

const startIdx = code.indexOf(startExtract);
const endIdx = code.indexOf(endExtract);

let newSummary = code.substring(0, startIdx);
newSummary += `
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
newSummary += code.substring(endIdx);

// 2. Remove OrderForecastWidgetSkeleton
const skelStart = newSummary.indexOf("const forecastSkeletonHeights = ['38%', '54%', '46%', '70%', '58%', '82%', '64%'];");
const skelEnd = newSummary.indexOf("export default Summary;");
if (skelStart !== -1 && skelEnd !== -1) {
    newSummary = newSummary.substring(0, skelStart) + newSummary.substring(skelEnd);
}

// 3. Remove blocking loading completely
newSummary = newSummary.replace(/    if \(loading && !statsToday && !statsOverall\) \{[\s\S]*?\}\n\n/, "");

// 4. Remove unused vars
newSummary = newSummary.replace("    const lowStockItems = statsOverall?.low_stock || [];\n", "");
newSummary = newSummary.replace("    const topCustomers = statsOverall?.top_customers || [];\n", "");
newSummary = newSummary.replace("    const staffProd = statsOverall?.staff_productivity || [];\n", "");

// 5. Update imports
newSummary = newSummary.replace("const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));", "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));");

// 6. Fix useEffect array
newSummary = newSummary.replace("    }, [filters.branch_id]);\n\n    const fetchBranches = async () => {", "    }, [filters.branch_id, fetchStatsSplit]);\n\n    const fetchBranches = async () => {");

// 7. Remove setLoading(true) 
newSummary = newSummary.replace(`    const [loading, setLoading] = useState(true);\n`, "");

// 8. Replace fetchStatsSplit completely
const oldFetchRegex = /    const fetchStatsSplit = async \(\) => \{[\s\S]*?\}\n    \};\n/;
const newFetchCode = `    const fetchStatsSplit = React.useCallback(async () => {
        try {
            const paramsToday = new URLSearchParams();
            if (filters.branch_id) paramsToday.append('branch_id', filters.branch_id);
            const today = new Date().toISOString().split('T')[0];
            paramsToday.append('startDate', today);
            paramsToday.append('endDate', today);

            const paramsOverall = new URLSearchParams();
            if (filters.branch_id) paramsOverall.append('branch_id', filters.branch_id);

            const [todayRes, overallRes] = await Promise.all([
                api.get(\`/stats/dashboard?\${paramsToday.toString()}\`),
                api.get(\`/stats/dashboard?\${paramsOverall.toString()}\`),
            ]);

            React.startTransition(() => {
                setStatsToday(todayRes.data);
                setStatsOverall(overallRes.data);
            });
        } catch {
            console.error('Failed to fetch dashboard stats');
        }
    }, [filters.branch_id]);
`;
newSummary = newSummary.replace(oldFetchRegex, newFetchCode);

fs.writeFileSync(summaryPath, newSummary);
console.log("Done");
