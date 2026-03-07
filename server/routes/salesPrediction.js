const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════════
//  Statistical Helpers — Pure JS, no external ML libraries needed
// ════════════════════════════════════════════════════════════════════

/** Simple linear regression: y = slope * x + intercept */
function linearRegression(points) {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const { x, y } of points) {
        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R² coefficient of determination
    const yMean = sumY / n;
    const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
    const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
}

/** Weighted moving average — recent months weighted more */
function weightedMovingAverage(values, weights = null) {
    if (values.length === 0) return 0;
    if (!weights) {
        // Default: linearly increasing weights
        weights = values.map((_, i) => i + 1);
    }
    const wSum = weights.reduce((a, b) => a + b, 0);
    const wAvg = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
    return wAvg;
}

/** Predict next N months using linear trend + seasonal adjustment */
function forecastMonths(monthlyData, ahead = 3) {
    if (monthlyData.length < 2) {
        const lastVal = monthlyData[0]?.value || 0;
        return Array.from({ length: ahead }, (_, i) => ({
            monthOffset: i + 1,
            predicted: lastVal,
            confidence: 'low'
        }));
    }

    // Linear trend
    const points = monthlyData.map((d, i) => ({ x: i, y: d.value }));
    const { slope, intercept, r2 } = linearRegression(points);

    // Seasonal factors (if 12+ months of data)
    const seasonalFactors = new Array(12).fill(1);
    if (monthlyData.length >= 12) {
        const monthAvgs = new Array(12).fill(0);
        const monthCounts = new Array(12).fill(0);
        const globalAvg = monthlyData.reduce((s, d) => s + d.value, 0) / monthlyData.length;

        monthlyData.forEach(d => {
            const m = d.month; // 0-11
            monthAvgs[m] += d.value;
            monthCounts[m]++;
        });

        for (let m = 0; m < 12; m++) {
            if (monthCounts[m] > 0 && globalAvg > 0) {
                seasonalFactors[m] = monthAvgs[m] / monthCounts[m] / globalAvg;
            }
        }
    }

    const n = monthlyData.length;
    const lastMonth = monthlyData[n - 1]?.month ?? 0;

    const predictions = [];
    for (let i = 1; i <= ahead; i++) {
        const trendVal = slope * (n - 1 + i) + intercept;
        const targetMonth = (lastMonth + i) % 12;
        const seasonalVal = trendVal * seasonalFactors[targetMonth];
        const predicted = Math.max(0, Math.round(seasonalVal));

        predictions.push({
            monthOffset: i,
            targetMonth,
            predicted,
            trend: Math.max(0, Math.round(trendVal)),
            confidence: r2 > 0.7 ? 'high' : r2 > 0.4 ? 'medium' : 'low'
        });
    }

    return predictions;
}

/** Compute growth rate as percentage */
function growthRate(current, previous) {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ════════════════════════════════════════════════════════════════════
//  GET /forecast — Overall + per-category demand forecast
// ════════════════════════════════════════════════════════════════════
router.get('/forecast', authenticateToken, async (req, res) => {
    try {
        const { months_back = 12, months_ahead = 3 } = req.query;
        const lookback = Math.min(Number(months_back) || 12, 36);
        const ahead = Math.min(Number(months_ahead) || 3, 6);

        // ─── Monthly totals (orders + revenue) ───
        const [monthlyTotals] = await pool.query(`
            SELECT
                YEAR(created_at) AS yr,
                MONTH(created_at) AS mo,
                COUNT(*) AS order_count,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(SUM(quantity), 0) AS total_qty
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
              AND status != 'Cancelled'
            GROUP BY yr, mo
            ORDER BY yr, mo
        `, [lookback]);

        // ─── Monthly totals by category ───
        const [monthlyCat] = await pool.query(`
            SELECT
                YEAR(j.created_at) AS yr,
                MONTH(j.created_at) AS mo,
                COALESCE(j.category, 'Uncategorized') AS category,
                COUNT(*) AS order_count,
                COALESCE(SUM(j.total_amount), 0) AS revenue,
                COALESCE(SUM(j.quantity), 0) AS total_qty
            FROM sarga_jobs j
            WHERE j.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
              AND j.status != 'Cancelled'
            GROUP BY yr, mo, category
            ORDER BY yr, mo
        `, [lookback]);

        // ─── Monthly totals by product ───
        const [monthlyProd] = await pool.query(`
            SELECT
                YEAR(j.created_at) AS yr,
                MONTH(j.created_at) AS mo,
                j.product_id,
                COALESCE(j.job_name, p.name, 'Unknown') AS product_name,
                COALESCE(j.category, 'Uncategorized') AS category,
                COUNT(*) AS order_count,
                COALESCE(SUM(j.total_amount), 0) AS revenue,
                COALESCE(SUM(j.quantity), 0) AS total_qty
            FROM sarga_jobs j
            LEFT JOIN sarga_products p ON j.product_id = p.id
            WHERE j.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
              AND j.status != 'Cancelled'
            GROUP BY yr, mo, j.product_id, product_name, category
            ORDER BY yr, mo
        `, [lookback]);

        // ─── Build time-series for overall ───
        const overallSeries = monthlyTotals.map(r => ({
            year: r.yr, month: r.mo - 1, value: r.order_count,
            revenue: Number(r.revenue), qty: Number(r.total_qty),
            label: `${MONTH_NAMES[r.mo - 1]} ${r.yr}`
        }));

        const overallForecast = forecastMonths(overallSeries, ahead);
        const overallRevSeries = monthlyTotals.map((r, i) => ({ x: i, y: Number(r.revenue) }));
        const revTrend = linearRegression(overallRevSeries);

        // ─── Build per-category forecasts ───
        const catMap = {};
        for (const r of monthlyCat) {
            if (!catMap[r.category]) catMap[r.category] = [];
            catMap[r.category].push({
                year: r.yr, month: r.mo - 1, value: r.order_count,
                revenue: Number(r.revenue), qty: Number(r.total_qty),
                label: `${MONTH_NAMES[r.mo - 1]} ${r.yr}`
            });
        }

        const categoryForecasts = Object.entries(catMap).map(([cat, series]) => {
            const forecast = forecastMonths(series, ahead);
            const totalOrders = series.reduce((s, d) => s + d.value, 0);
            const lastMonthVal = series.length > 0 ? series[series.length - 1].value : 0;
            const prevMonthVal = series.length > 1 ? series[series.length - 2].value : 0;
            const growth = growthRate(lastMonthVal, prevMonthVal);

            // Demand level for next month
            const nextPredicted = forecast[0]?.predicted || 0;
            let demandLevel = 'Low';
            if (nextPredicted >= 20) demandLevel = 'High';
            else if (nextPredicted >= 8) demandLevel = 'Medium';

            return {
                category: cat,
                total_orders: totalOrders,
                last_month_orders: lastMonthVal,
                growth_pct: growth,
                demand_level: demandLevel,
                forecast,
                history: series
            };
        }).sort((a, b) => (b.forecast[0]?.predicted || 0) - (a.forecast[0]?.predicted || 0));

        // ─── Build per-product top movers ───
        const prodMap = {};
        for (const r of monthlyProd) {
            const key = r.product_id || r.product_name;
            if (!prodMap[key]) prodMap[key] = { name: r.product_name, category: r.category, series: [] };
            prodMap[key].series.push({ year: r.yr, month: r.mo - 1, value: r.order_count, revenue: Number(r.revenue) });
        }

        const productForecasts = Object.values(prodMap).map(p => {
            const forecast = forecastMonths(p.series, 1);
            const totalOrders = p.series.reduce((s, d) => s + d.value, 0);
            const lastVal = p.series.length > 0 ? p.series[p.series.length - 1].value : 0;
            const prevVal = p.series.length > 1 ? p.series[p.series.length - 2].value : 0;
            return {
                product_name: p.name,
                category: p.category,
                total_orders: totalOrders,
                last_month: lastVal,
                growth_pct: growthRate(lastVal, prevVal),
                next_month_predicted: forecast[0]?.predicted || 0,
                confidence: forecast[0]?.confidence || 'low'
            };
        }).sort((a, b) => b.next_month_predicted - a.next_month_predicted);

        // ─── Response ───
        const now = new Date();
        const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
        const nextMonthLabel = `${MONTH_NAMES[(now.getMonth() + 1) % 12]} ${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}`;

        res.json({
            period: { months_back: lookback, months_ahead: ahead },
            current_month: currentMonthLabel,
            next_month: nextMonthLabel,
            overall: {
                history: overallSeries,
                forecast: overallForecast.map((f, i) => {
                    const fMonth = (now.getMonth() + f.monthOffset) % 12;
                    const fYear = now.getFullYear() + Math.floor((now.getMonth() + f.monthOffset) / 12);
                    return { ...f, label: `${MONTH_NAMES[fMonth]} ${fYear}` };
                }),
                revenue_trend: {
                    direction: revTrend.slope > 0 ? 'up' : revTrend.slope < 0 ? 'down' : 'flat',
                    r2: Math.round(revTrend.r2 * 100),
                    monthly_change: Math.round(revTrend.slope)
                }
            },
            categories: categoryForecasts,
            top_products: productForecasts.slice(0, 15),
            rising_products: productForecasts.filter(p => p.growth_pct > 10).slice(0, 10),
            declining_products: productForecasts.filter(p => p.growth_pct < -10).slice(0, 10),
            generated_at: now.toISOString()
        });
    } catch (err) {
        console.error('Sales forecast error:', err);
        res.status(500).json({ message: 'Failed to generate forecast', error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════
//  GET /insights — High-level AI insights dashboard
// ════════════════════════════════════════════════════════════════════
router.get('/insights', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const thisMonth = now.getMonth() + 1;
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
        const lastMonthYear = thisMonth === 1 ? thisYear - 1 : thisYear;

        // Current month stats
        const [[currentStats]] = await pool.query(`
            SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue,
                   COALESCE(SUM(quantity), 0) AS qty
            FROM sarga_jobs
            WHERE MONTH(created_at) = ? AND YEAR(created_at) = ? AND status != 'Cancelled'
        `, [thisMonth, thisYear]);

        // Last month stats  
        const [[lastStats]] = await pool.query(`
            SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue,
                   COALESCE(SUM(quantity), 0) AS qty
            FROM sarga_jobs
            WHERE MONTH(created_at) = ? AND YEAR(created_at) = ? AND status != 'Cancelled'
        `, [lastMonth, lastMonthYear]);

        // Top product this month
        const [topProducts] = await pool.query(`
            SELECT COALESCE(j.job_name, p.name, 'Unknown') AS product_name,
                   j.category, COUNT(*) AS order_count,
                   COALESCE(SUM(j.total_amount), 0) AS revenue
            FROM sarga_jobs j
            LEFT JOIN sarga_products p ON j.product_id = p.id
            WHERE MONTH(j.created_at) = ? AND YEAR(j.created_at) = ? AND j.status != 'Cancelled'
            GROUP BY product_name, j.category
            ORDER BY order_count DESC
            LIMIT 5
        `, [thisMonth, thisYear]);

        // Top category this month
        const [topCats] = await pool.query(`
            SELECT COALESCE(category, 'Uncategorized') AS category,
                   COUNT(*) AS order_count,
                   COALESCE(SUM(total_amount), 0) AS revenue
            FROM sarga_jobs
            WHERE MONTH(created_at) = ? AND YEAR(created_at) = ? AND status != 'Cancelled'
            GROUP BY category
            ORDER BY order_count DESC
        `, [thisMonth, thisYear]);

        // Day-of-week pattern (last 3 months)
        const [dowPattern] = await pool.query(`
            SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS orders
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) AND status != 'Cancelled'
            GROUP BY dow ORDER BY dow
        `);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekdayPattern = dowPattern.map(r => ({ day: dayNames[r.dow - 1], orders: r.orders }));

        // Customer type mix
        const [custMix] = await pool.query(`
            SELECT COALESCE(c.type, 'Walk-in') AS customer_type, COUNT(j.id) AS orders,
                   COALESCE(SUM(j.total_amount), 0) AS revenue
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE j.created_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) AND j.status != 'Cancelled'
            GROUP BY customer_type ORDER BY orders DESC
        `);

        // Generate AI-style text insights
        const revenueGrowth = growthRate(Number(currentStats.revenue), Number(lastStats.revenue));
        const orderGrowth = growthRate(currentStats.orders, lastStats.orders);

        const insights = [];
        if (topProducts.length > 0) {
            insights.push({
                type: 'top_product',
                icon: '🏆',
                title: `Top product this month: ${topProducts[0].product_name}`,
                detail: `${topProducts[0].order_count} orders, ₹${Number(topProducts[0].revenue).toLocaleString('en-IN')} revenue`
            });
        }
        if (revenueGrowth > 0) {
            insights.push({
                type: 'revenue_up',
                icon: '📈',
                title: `Revenue up ${revenueGrowth}% vs last month`,
                detail: `₹${Number(currentStats.revenue).toLocaleString('en-IN')} this month vs ₹${Number(lastStats.revenue).toLocaleString('en-IN')} last month`
            });
        } else if (revenueGrowth < -5) {
            insights.push({
                type: 'revenue_down',
                icon: '📉',
                title: `Revenue down ${Math.abs(revenueGrowth)}% vs last month`,
                detail: `Consider promotions or seasonal adjustments`
            });
        }
        if (weekdayPattern.length > 0) {
            const peakDay = weekdayPattern.reduce((max, d) => d.orders > max.orders ? d : max, weekdayPattern[0]);
            insights.push({
                type: 'peak_day',
                icon: '📅',
                title: `Busiest day: ${peakDay.day}`,
                detail: `${peakDay.orders} orders on ${peakDay.day}s over 3 months. Plan extra staff.`
            });
        }

        res.json({
            current_month: { label: `${MONTH_NAMES[thisMonth - 1]} ${thisYear}`, ...currentStats, revenue: Number(currentStats.revenue) },
            last_month: { label: `${MONTH_NAMES[lastMonth - 1]} ${lastMonthYear}`, ...lastStats, revenue: Number(lastStats.revenue) },
            growth: { revenue_pct: revenueGrowth, orders_pct: orderGrowth },
            top_products: topProducts,
            top_categories: topCats,
            weekday_pattern: weekdayPattern,
            customer_mix: custMix,
            insights,
            generated_at: now.toISOString()
        });
    } catch (err) {
        console.error('Sales insights error:', err);
        res.status(500).json({ message: 'Failed to generate insights', error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════
//  GET /stock-recommendations — AI paper & inventory planning
// ════════════════════════════════════════════════════════════════════
router.get('/stock-recommendations', authenticateToken, async (req, res) => {
    try {
        // Avg monthly usage of inventory items (via jobs with products linked to inventory)
        const [usage] = await pool.query(`
            SELECT
                i.id AS inventory_id,
                i.name AS item_name,
                i.category,
                i.quantity AS current_stock,
                i.reorder_level,
                i.unit,
                COUNT(j.id) AS jobs_last_3m,
                COALESCE(SUM(j.quantity), 0) AS qty_used_3m
            FROM sarga_inventory i
            LEFT JOIN sarga_products p ON p.inventory_item_id = i.id
            LEFT JOIN sarga_jobs j ON j.product_id = p.id
                AND j.created_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
                AND j.status != 'Cancelled'
            GROUP BY i.id
            HAVING current_stock > 0 OR jobs_last_3m > 0
            ORDER BY qty_used_3m DESC
        `);

        // Category-level demand for next month (use category from jobs)
        const [catDemand] = await pool.query(`
            SELECT COALESCE(category, 'Uncategorized') AS category,
                   MONTH(created_at) AS mo,
                   COUNT(*) AS orders,
                   COALESCE(SUM(quantity), 0) AS qty
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
              AND status != 'Cancelled'
            GROUP BY category, mo
            ORDER BY category, mo
        `);

        const recommendations = usage.map(item => {
            const avgMonthlyUsage = Math.round(Number(item.qty_used_3m) / 3);
            const monthsOfStock = avgMonthlyUsage > 0 ? Math.round(item.current_stock / avgMonthlyUsage * 10) / 10 : null;
            const predictedNextMonth = Math.round(avgMonthlyUsage * 1.1); // 10% buffer
            const shouldOrder = item.current_stock <= item.reorder_level || (monthsOfStock !== null && monthsOfStock < 1.5);
            const orderQty = shouldOrder ? Math.max(0, predictedNextMonth * 2 - item.current_stock) : 0;

            let urgency = 'ok';
            if (monthsOfStock !== null && monthsOfStock < 0.5) urgency = 'critical';
            else if (monthsOfStock !== null && monthsOfStock < 1) urgency = 'low_stock';
            else if (shouldOrder) urgency = 'reorder';

            return {
                item_name: item.item_name,
                category: item.category,
                current_stock: item.current_stock,
                unit: item.unit,
                reorder_level: item.reorder_level,
                avg_monthly_usage: avgMonthlyUsage,
                months_of_stock: monthsOfStock,
                predicted_next_month: predictedNextMonth,
                should_order: shouldOrder,
                suggested_order_qty: orderQty,
                urgency
            };
        }).sort((a, b) => {
            const urgencyOrder = { critical: 0, low_stock: 1, reorder: 2, ok: 3 };
            return (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3);
        });

        res.json({
            recommendations,
            summary: {
                total_items: recommendations.length,
                critical: recommendations.filter(r => r.urgency === 'critical').length,
                low_stock: recommendations.filter(r => r.urgency === 'low_stock').length,
                need_reorder: recommendations.filter(r => r.should_order).length
            },
            generated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Stock recommendations error:', err);
        res.status(500).json({ message: 'Failed to generate stock recommendations', error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════
//  GET /seasonal — Seasonality & trend analysis
// ════════════════════════════════════════════════════════════════════
router.get('/seasonal', authenticateToken, async (req, res) => {
    try {
        // Monthly aggregates for up to 24 months
        const [monthly] = await pool.query(`
            SELECT
                YEAR(created_at) AS yr,
                MONTH(created_at) AS mo,
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(AVG(total_amount), 0) AS avg_order_value
            FROM sarga_jobs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 24 MONTH) AND status != 'Cancelled'
            GROUP BY yr, mo
            ORDER BY yr, mo
        `);

        // Build seasonal index (which months are higher/lower than average)
        const monthTotals = new Array(12).fill(0);
        const monthCounts = new Array(12).fill(0);
        monthly.forEach(r => {
            monthTotals[r.mo - 1] += r.orders;
            monthCounts[r.mo - 1]++;
        });

        const avgAll = monthly.reduce((s, r) => s + r.orders, 0) / (monthly.length || 1);
        const seasonalIndex = MONTH_NAMES.map((name, i) => {
            const avg = monthCounts[i] > 0 ? monthTotals[i] / monthCounts[i] : 0;
            return {
                month: name,
                avg_orders: Math.round(avg),
                index: avgAll > 0 ? Math.round((avg / avgAll) * 100) : 100,
                label: avg > avgAll * 1.15 ? 'Peak' : avg < avgAll * 0.85 ? 'Slow' : 'Normal'
            };
        });

        // Revenue trend (linear regression over months)
        const revPoints = monthly.map((r, i) => ({ x: i, y: Number(r.revenue) }));
        const orderPoints = monthly.map((r, i) => ({ x: i, y: r.orders }));
        const revReg = linearRegression(revPoints);
        const orderReg = linearRegression(orderPoints);

        // YoY comparison
        const now = new Date();
        const thisYearData = monthly.filter(r => r.yr === now.getFullYear());
        const lastYearData = monthly.filter(r => r.yr === now.getFullYear() - 1);
        const thisYearOrders = thisYearData.reduce((s, r) => s + r.orders, 0);
        const lastYearOrders = lastYearData.reduce((s, r) => s + r.orders, 0);

        res.json({
            monthly_data: monthly.map(r => ({
                label: `${MONTH_NAMES[r.mo - 1]} ${r.yr}`,
                year: r.yr, month: r.mo,
                orders: r.orders,
                revenue: Number(r.revenue),
                avg_order_value: Math.round(Number(r.avg_order_value))
            })),
            seasonal_index: seasonalIndex,
            trends: {
                revenue: { direction: revReg.slope > 0 ? 'growing' : 'declining', r2: Math.round(revReg.r2 * 100), monthly_change: Math.round(revReg.slope) },
                orders: { direction: orderReg.slope > 0 ? 'growing' : 'declining', r2: Math.round(orderReg.r2 * 100), monthly_change: Math.round(orderReg.slope * 10) / 10 }
            },
            yoy: {
                this_year: thisYearOrders,
                last_year: lastYearOrders,
                growth_pct: growthRate(thisYearOrders, lastYearOrders)
            },
            generated_at: now.toISOString()
        });
    } catch (err) {
        console.error('Seasonal analysis error:', err);
        res.status(500).json({ message: 'Failed to generate seasonal analysis', error: err.message });
    }
});

module.exports = router;
