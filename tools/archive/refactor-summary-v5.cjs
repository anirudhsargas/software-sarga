const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
const code = fs.readFileSync(summaryPath, 'utf8');

// The exact start string
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

// Remove OrderForecastWidgetSkeleton and OrderForecastWidget from Summary.jsx
newSummary = newSummary.replace("const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));\n", "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));\n");

const skeletonRegex = /const forecastSkeletonHeights = \['38%', '54%', '46%', '70%', '58%', '82%', '64%'\];\n\nconst OrderForecastWidgetSkeleton = \(\) => \([\s\S]*?\);\n\n/;
newSummary = newSummary.replace(skeletonRegex, "");

// Removing the blocking loading and unused variables
const blockToRemove = `    if (loading && !statsToday && !statsOverall) {
        return (
            <div className="flex items-center justify-center p-40">
                <Loader2 className="animate-spin text-accent" size={48} />
            </div>
        );
    }

    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];`;
newSummary = newSummary.replace(blockToRemove, "");

// Remove the `const [loading, setLoading] = useState(true);`
newSummary = newSummary.replace(`    const [loading, setLoading] = useState(true);\n`, "");

// Modify fetchStatsSplit to use useCallback and startTransition
const oldFetch = `    const fetchStatsSplit = async () => {
        setLoading(true);
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

            setStatsToday(todayRes.data);
            setStatsOverall(overallRes.data);
        } catch {
            console.error('Failed to fetch dashboard stats');
        } finally {
            setLoading(false);
        }
    };`;

const newFetch = `    const fetchStatsSplit = React.useCallback(async () => {
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
    }, [filters.branch_id]);`;

newSummary = newSummary.replace(oldFetch, newFetch);

fs.writeFileSync(summaryPath, newSummary);

console.log("Success");
