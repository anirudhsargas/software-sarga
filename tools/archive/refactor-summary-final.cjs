const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
let code = fs.readFileSync(summaryPath, 'utf8');

// 1. Update imports
code = code.replace(
    "const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));",
    "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));"
);

// 2. Remove loading state variable
code = code.replace("const [loading, setLoading] = useState(true);\n    ", "");

// 3. Update useEffect
code = code.replace("    }, [filters.branch_id]);\n\n    const fetchBranches", "    }, [filters.branch_id, fetchStatsSplit]);\n\n    const fetchBranches");

// 4. Update fetchStatsSplit
const fetchOld = `    const fetchStatsSplit = async () => {
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

const fetchNew = `    const fetchStatsSplit = React.useCallback(async () => {
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

code = code.replace(fetchOld, fetchNew);

// 5. Remove blocking loading return
const blockLoading = `    if (loading && !statsToday && !statsOverall) {
        return (
            <div className="flex items-center justify-center p-40">
                <Loader2 className="animate-spin text-accent" size={48} />
            </div>
        );
    }

`;
code = code.replace(blockLoading, "");

// 6. Remove unused variables (they were used inside the extracted part)
code = code.replace("    const lowStockItems = statsOverall?.low_stock || [];\n", "");
code = code.replace("    const topCustomers = statsOverall?.top_customers || [];\n", "");
code = code.replace("    const staffProd = statsOverall?.staff_productivity || [];\n", "");


// 7. Extract section 1.5 to end of overview tab
const startExtract = `{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}`;
const endExtract = `
            {activeTab === 'ai-monitoring' && (`;

const startIdx = code.indexOf(startExtract);
const endIdx = code.indexOf(endExtract);

if (startIdx !== -1 && endIdx !== -1) {
    let toReplace = code.substring(startIdx, endIdx);
    // Find the last </Suspense> tag inside the toReplace block (which is for OrderForecastWidget)
    // Then find the closing </> )} tags.
    // Instead of string gymnastics, we'll just replace the whole thing because we know we want to drop it and insert our own closing tags.
    
    const replacement = `                    {/* ─── Deferred Below-The-Fold Widgets ─── */}
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
            )}`;
    
    code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
} else {
    console.error("Could not find start/end indices for replacement.");
}

// 8. Remove OrderForecastWidgetSkeleton
const skelStart = code.indexOf("const forecastSkeletonHeights");
const skelEnd = code.indexOf("export default Summary;");
if (skelStart !== -1 && skelEnd !== -1) {
    code = code.substring(0, skelStart) + code.substring(skelEnd);
}

fs.writeFileSync(summaryPath, code);
console.log("Summary.jsx refactored successfully.");
