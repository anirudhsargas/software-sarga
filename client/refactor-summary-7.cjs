const fs = require('fs');

const path = 'D:/software sarga/client/src/pages/Summary.jsx';
const code = fs.readFileSync(path, 'utf8');
const lines = code.split('\n');
const newLines = [];

let skipMode = false;
let foundLoading = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Update imports
    if (line.includes("const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));")) {
        newLines.push("const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));");
        continue;
    }

    // 2. Remove setLoading
    if (line.includes("const [loading, setLoading] = useState(true);")) {
        continue;
    }

    // 3. Update useEffect
    if (line.includes("}, [filters.branch_id]);")) {
        // Only modify if it's the first one, or just check the previous line to be sure.
        // Actually, just change it if the next line is `    const fetchBranches` or `    const fmt`
        if (i + 2 < lines.length && lines[i + 2].includes("const fetchBranches")) {
            newLines.push("    }, [filters.branch_id, fetchStatsSplit]);");
            continue;
        }
    }

    // 4. fetchStatsSplit startTransition wrap
    if (line.includes("const fetchStatsSplit = async () => {")) {
        newLines.push("    const fetchStatsSplit = React.useCallback(async () => {");
        continue;
    }
    if (line.includes("setLoading(true);")) {
        continue;
    }
    if (line.includes("setStatsToday(todayRes.data);")) {
        newLines.push("            React.startTransition(() => {");
        newLines.push("                setStatsToday(todayRes.data);");
        continue;
    }
    if (line.includes("setStatsOverall(overallRes.data);")) {
        newLines.push("                setStatsOverall(overallRes.data);");
        newLines.push("            });");
        continue;
    }
    if (line.includes("} catch {")) {
        newLines.push(line);
        newLines.push(lines[i + 1]); // console.error
        // skip the finally block
        i += 4;
        newLines.push("    }, [filters.branch_id]);");
        continue;
    }

    // 5. Remove blocking loading return
    if (line.includes("if (loading && !statsToday && !statsOverall) {")) {
        i += 6; // skip the whole block
        continue;
    }

    // 6. Remove unused vars
    if (line.includes("const lowStockItems = statsOverall?.low_stock || [];")) continue;
    if (line.includes("const topCustomers = statsOverall?.top_customers || [];")) continue;
    if (line.includes("const staffProd = statsOverall?.staff_productivity || [];")) continue;

    // 7. Extract section 1.5 to end of overview tab
    if (line.includes("{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}")) {
        skipMode = true;
        newLines.push(`                    {/* ─── Deferred Below-The-Fold Widgets ─── */}`);
        newLines.push(`                    <Suspense fallback={<div className="skeleton-wrapper"><div className="skeleton" style={{height: 400, marginTop: 24, borderRadius: 8}}></div></div>}>`);
        newLines.push(`                        <SummaryWidgets `);
        newLines.push(`                            statsToday={statsToday} `);
        newLines.push(`                            statsOverall={statsOverall} `);
        newLines.push(`                            navigate={navigate} `);
        newLines.push(`                            fmt={fmt} `);
        newLines.push(`                            fmtNum={fmtNum} `);
        newLines.push(`                            getStatusColor={getStatusColor} `);
        newLines.push(`                            filters={filters}`);
        newLines.push(`                        />`);
        newLines.push(`                    </Suspense>`);
        newLines.push(`                </>`);
        newLines.push(`            )}`);
        continue;
    }

    if (skipMode && line.includes("{activeTab === 'ai-monitoring' && (")) {
        skipMode = false;
    }

    if (skipMode) {
        continue;
    }

    // 8. Remove OrderForecastWidgetSkeleton
    if (line.includes("const forecastSkeletonHeights")) {
        skipMode = true;
        continue;
    }
    if (skipMode && line.includes("export default Summary;")) {
        skipMode = false;
        newLines.push(line);
        continue;
    }

    newLines.push(line);
}

fs.writeFileSync(path, newLines.join('\n'));
console.log("Success");
