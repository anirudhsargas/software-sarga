const fs = require('fs');

const summaryPath = 'D:/software sarga/client/src/pages/Summary.jsx';
const widgetsPath = 'D:/software sarga/client/src/pages/SummaryWidgets.jsx';

let code = fs.readFileSync(summaryPath, 'utf8');

// The marker where we split:
const splitMarker = "{/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}";
const splitIndex = code.indexOf(splitMarker);

if (splitIndex !== -1) {
    const topPart = code.substring(0, splitIndex);
    // Find where the overview tab ends
    const endTabMarker = "{activeTab === 'ai-monitoring' && (";
    const endTabIndex = code.indexOf(endTabMarker);
    const bottomPart = code.substring(splitIndex, endTabIndex);
    
    // bottomPart contains sections 1.5 to 7.
    // It uses: statsToday, statsOverall, navigate, fmt, fmtNum, getStatusColor, lowStockItems, topCustomers, staffProd, filters

    const widgetsCode = `
import React, { Suspense } from 'react';
import { ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, IndianRupee, TrendingUp, BarChart3, Activity, ClipboardList, Printer, Wallet, AlertTriangle, UserCheck, Users, Loader2 } from 'lucide-react';
const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));

const SummaryWidgets = React.memo(({ statsToday, statsOverall, navigate, fmt, fmtNum, getStatusColor, filters }) => {
    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];

    return (
        <>
            ${bottomPart.trim()}
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
    fs.writeFileSync(widgetsPath, widgetsCode);

    // Now update Summary.jsx
    // Remove bottomPart and replace with <Suspense><SummaryWidgets ... /></Suspense>
    // Remove OrderForecastWidgetSkeleton from Summary.jsx
    
    // Also remove blocking loading: `if (loading && !statsToday && !statsOverall) { return <Loader2 ... /> }`
    // And wrap fetchStatsSplit inside React.startTransition

    let newSummary = code.replace(bottomPart, `
                    <Suspense fallback={<div className="skeleton-wrapper"><div className="skeleton" style={{height: 400}}></div></div>}>
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
    `);
    
    // Fix the `</>)}` duplicate issue
    newSummary = newSummary.replace(/\s*<\/>\s*\)\}\s*<\/>\s*\)\}/, "\n                </>\n            )}");

    // Remove the skeleton from Summary.jsx since it's moved
    newSummary = newSummary.replace(/const forecastSkeletonHeights[\s\S]*OrderForecastWidgetSkeleton[\s\S]*?\);\n/g, '');

    // Import SummaryWidgets
    newSummary = newSummary.replace(
        "const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));",
        "const SummaryWidgets = React.lazy(() => import('./SummaryWidgets'));"
    );

    // Make loading non-blocking
    newSummary = newSummary.replace(/if \(loading && !statsToday && !statsOverall\) \{[\s\S]*?\}\n/m, '');

    // startTransition for fetching
    newSummary = newSummary.replace(/setStatsToday\(todayRes\.data\);\s*setStatsOverall\(overallRes\.data\);/, `
            React.startTransition(() => {
                setStatsToday(todayRes.data);
                setStatsOverall(overallRes.data);
            });
    `);

    // Add useTransition maybe? We just use React.startTransition

    fs.writeFileSync(summaryPath, newSummary);
    console.log('Summary.jsx split completed');
} else {
    console.log('Split marker not found');
}
