const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');

// ═══════════════════════════════════════════════════════════════
//  AI Customer Order Predictions
//  Analyzes historical job patterns to predict upcoming orders.
//  Example: "XYZ School ordered answer sheets every February"
// ═══════════════════════════════════════════════════════════════

/**
 * GET /predictions
 * Returns predicted upcoming orders based on recurring historical patterns.
 * Query: ?lookahead_days=45&min_occurrences=2&branch_id=
 */
router.get('/predictions', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'),
  asyncHandler(async (req, res) => {
    const lookaheadDays = Math.min(Number(req.query.lookahead_days) || 45, 120);
    const minOccurrences = Math.max(Number(req.query.min_occurrences) || 2, 2);
    const branchId = req.query.branch_id || null;

    // ── Step 1: Find recurring customer+category patterns ───
    // Group jobs by customer, category, and month-of-year. If a customer
    // ordered the same category in the same month across ≥ N distinct years,
    // that's a recurring pattern.
    let branchCond = '';
    const params = [minOccurrences];
    if (branchId) {
      branchCond = 'AND j.branch_id = ?';
      params.push(branchId);
    }

    const [patterns] = await pool.query(`
      SELECT
        j.customer_id,
        c.name        AS customer_name,
        c.mobile      AS customer_mobile,
        c.type        AS customer_type,
        j.category,
        MONTH(j.created_at) AS order_month,
        COUNT(*)              AS total_orders,
        COUNT(DISTINCT YEAR(j.created_at)) AS distinct_years,
        MIN(YEAR(j.created_at))   AS first_year,
        MAX(YEAR(j.created_at))   AS last_year,
        ROUND(AVG(j.total_amount), 2) AS avg_amount,
        ROUND(SUM(j.total_amount), 2) AS total_amount,
        ROUND(AVG(j.quantity), 1)     AS avg_quantity,
        GROUP_CONCAT(DISTINCT j.job_name ORDER BY j.created_at DESC SEPARATOR ' | ') AS sample_jobs,
        GROUP_CONCAT(DISTINCT YEAR(j.created_at) ORDER BY YEAR(j.created_at) DESC) AS years_ordered,
        MAX(j.created_at) AS last_order_date,
        (SELECT b.name FROM sarga_branches b WHERE b.id = j.branch_id LIMIT 1) AS branch_name
      FROM sarga_jobs j
      INNER JOIN sarga_customers c ON j.customer_id = c.id
      WHERE j.status != 'Cancelled'
        AND j.customer_id IS NOT NULL
        AND j.category IS NOT NULL
        AND j.category != ''
        ${branchCond}
      GROUP BY j.customer_id, c.name, c.mobile, c.type,
               j.category, MONTH(j.created_at), j.branch_id
      HAVING distinct_years >= ?
      ORDER BY distinct_years DESC, total_orders DESC
    `, [...(branchId ? [branchId] : []), minOccurrences]);

    // ── Step 2: Score patterns and pick those due soon ───
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-based
    const currentYear = now.getFullYear();
    const predictions = [];

    for (const p of patterns) {
      const orderMonth = p.order_month;
      const yearsOrdered = String(p.years_ordered).split(',').map(Number);

      // Skip if they already ordered this year for this pattern
      if (yearsOrdered.includes(currentYear)) continue;

      // Calculate how many days until the pattern month
      let targetDate = new Date(currentYear, orderMonth - 1, 15); // middle of month
      if (targetDate < now) {
        // Pattern month already passed this year without an order — flag as overdue
        targetDate = now;
      }
      const daysUntil = Math.round((targetDate - now) / (1000 * 60 * 60 * 24));

      // Only include if within lookahead window (or overdue = daysUntil <= 0)
      if (daysUntil > lookaheadDays) continue;

      // Confidence score (0-100)
      const yearSpan = p.last_year - p.first_year + 1;
      const consistency = p.distinct_years / yearSpan; // how many years they actually ordered vs possible
      const recency = p.last_year >= currentYear - 1 ? 1 : p.last_year >= currentYear - 2 ? 0.7 : 0.4;
      const volumeBonus = Math.min(p.total_orders / 10, 1) * 0.1;
      const score = Math.round((consistency * 0.5 + recency * 0.4 + volumeBonus) * 100);

      const isOverdue = daysUntil <= 0 && orderMonth < currentMonth;

      // Human-readable sample job names (limit to 3)
      const sampleJobs = String(p.sample_jobs || '').split(' | ').slice(0, 3);

      predictions.push({
        customer_id: p.customer_id,
        customer_name: p.customer_name,
        customer_mobile: p.customer_mobile,
        customer_type: p.customer_type,
        category: p.category,
        predicted_month: orderMonth,
        predicted_month_name: monthName(orderMonth),
        days_until: daysUntil,
        is_overdue: isOverdue,
        confidence_score: Math.min(score, 99),
        confidence_label: score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low',
        avg_order_value: Number(p.avg_amount),
        total_historical_value: Number(p.total_amount),
        avg_quantity: Number(p.avg_quantity),
        total_orders: p.total_orders,
        distinct_years: p.distinct_years,
        years_ordered: yearsOrdered,
        first_year: p.first_year,
        last_year: p.last_year,
        last_order_date: p.last_order_date,
        sample_jobs: sampleJobs,
        branch_name: p.branch_name,
      });
    }

    // Sort: overdue first, then by days_until ascending, then confidence desc
    predictions.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      if (a.days_until !== b.days_until) return a.days_until - b.days_until;
      return b.confidence_score - a.confidence_score;
    });

    // ── Step 3: Summary stats ───
    const totalPredicted = predictions.length;
    const highConf = predictions.filter(p => p.confidence_label === 'High').length;
    const overdueCount = predictions.filter(p => p.is_overdue).length;
    const estimatedRevenue = predictions.reduce((s, p) => s + p.avg_order_value, 0);

    res.json({
      predictions,
      summary: {
        total: totalPredicted,
        high_confidence: highConf,
        medium_confidence: predictions.filter(p => p.confidence_label === 'Medium').length,
        low_confidence: predictions.filter(p => p.confidence_label === 'Low').length,
        overdue: overdueCount,
        estimated_revenue: Math.round(estimatedRevenue),
        lookahead_days: lookaheadDays,
      }
    });
  })
);


/**
 * GET /predictions/customer/:id
 * Full prediction history for a specific customer — all recurring patterns.
 */
router.get('/predictions/customer/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'),
  asyncHandler(async (req, res) => {
    const customerId = req.params.id;

    // All jobs grouped by category + month
    const [history] = await pool.query(`
      SELECT
        j.category,
        MONTH(j.created_at) AS order_month,
        YEAR(j.created_at) AS order_year,
        COUNT(*) AS order_count,
        ROUND(SUM(j.total_amount), 2) AS total_amount,
        ROUND(AVG(j.total_amount), 2) AS avg_amount,
        ROUND(SUM(j.quantity), 1)     AS total_quantity,
        GROUP_CONCAT(DISTINCT j.job_name ORDER BY j.created_at DESC SEPARATOR ' | ') AS job_names
      FROM sarga_jobs j
      WHERE j.customer_id = ?
        AND j.status != 'Cancelled'
        AND j.category IS NOT NULL
        AND j.category != ''
      GROUP BY j.category, MONTH(j.created_at), YEAR(j.created_at)
      ORDER BY j.category, order_year DESC, order_month ASC
    `, [customerId]);

    // Customer info
    const [[customer]] = await pool.query(
      'SELECT id, name, mobile, type, email FROM sarga_customers WHERE id = ?',
      [customerId]
    );

    // Build a calendar heatmap: category → { month → [years] }
    const patternMap = {};
    for (const row of history) {
      const key = row.category;
      if (!patternMap[key]) patternMap[key] = { category: key, months: {}, totalOrders: 0, totalValue: 0 };
      if (!patternMap[key].months[row.order_month]) {
        patternMap[key].months[row.order_month] = { years: [], orders: 0, value: 0 };
      }
      patternMap[key].months[row.order_month].years.push(row.order_year);
      patternMap[key].months[row.order_month].orders += row.order_count;
      patternMap[key].months[row.order_month].value += Number(row.total_amount);
      patternMap[key].totalOrders += row.order_count;
      patternMap[key].totalValue += Number(row.total_amount);
    }

    res.json({
      customer: customer || null,
      patterns: Object.values(patternMap),
    });
  })
);


function monthName(m) {
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][m - 1] || '';
}

module.exports = router;
