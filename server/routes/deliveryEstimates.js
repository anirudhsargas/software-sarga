const express = require('express');
const router = express.Router();
const { pool } = require('../database');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function isSunday(date) {
  return date.getDay() === 0;
}

const HOLIDAYS = [
  '2026-01-26', '2026-08-15', '2026-10-02',
  '2026-01-15', '2026-03-01', '2026-04-14',
  '2026-08-31', '2026-09-07', '2026-10-22',
  '2026-11-14', '2026-12-25'
];

function isHoliday(date) {
  return HOLIDAYS.includes(date.toISOString().slice(0, 10));
}

function addWorkingDays(startDate, days) {
  let count = 0;
  let current = new Date(startDate);
  while (count < days) {
    current.setDate(current.getDate() + 1);
    if (!isSunday(current) && !isHoliday(current)) count++;
  }
  return current;
}

// GET /api/delivery/estimate - Enhanced delivery calculation
router.get('/delivery/estimate', asyncHandler(async (req, res) => {
  const { product_type, quantity, service_type, branch_id, product_id } = req.query;

  if (!product_type && !service_type && !product_id) {
    return res.status(400).json({ error: 'product_type, service_type, or product_id required' });
  }

  // 1. Find matching rule
  let category = product_type || service_type;
  let [rules] = await pool.query(
    'SELECT * FROM sarga_delivery_rules WHERE (product_category = ? OR service_type = ?) AND is_active = 1 LIMIT 1',
    [category, category]
  );

  if (rules.length === 0) {
    [rules] = await pool.query(
      'SELECT * FROM sarga_delivery_rules WHERE is_active = 1 ORDER BY base_days DESC LIMIT 1'
    );
  }

  // 2. Check express production rules
  let expressLabels = [];
  if (product_id) {
    const [expressRules] = await pool.query(
      'SELECT * FROM express_production_rules WHERE (product_id = ? OR product_category = ?) AND is_active = 1 LIMIT 1',
      [product_id, category]
    );
    if (expressRules.length > 0) {
      const qty = parseInt(quantity) || 1;
      const now = new Date();
      const hr = now.getHours();
      if (expressRules[0].turnaround_3hr && qty <= expressRules[0].max_qty_3hr && hr < 14) {
        expressLabels.push('Ready in 3 Hours');
      }
      if (expressRules[0].turnaround_today && qty <= expressRules[0].max_qty_today && hr < 17) {
        expressLabels.push('Ready Today');
      }
      if (expressRules[0].turnaround_tomorrow && qty <= expressRules[0].max_qty_tomorrow) {
        expressLabels.push('Ready Tomorrow');
      }
    }
  }

  // 3. Calculate base delivery days
  let baseDays = 3;
  let queueDepth = 0;
  let machineLoad = 0;
  let capacityFactor = 0;

  if (rules.length > 0) {
    baseDays = rules[0].base_days;
    const qty = parseInt(quantity) || 1;
    const capacity = rules[0].capacity_per_day || 50;
    const extraDays = Math.floor((qty - 1) / Math.max(capacity, 1));
    baseDays += extraDays;
    capacityFactor = extraDays;
  }

  // 4. Calculate queue depth if branch specified
  if (branch_id) {
    const [queue] = await pool.query(
      `SELECT COUNT(*) as cnt FROM sarga_jobs
       WHERE branch_id = ? AND status NOT IN ('Delivered', 'Cancelled', 'Completed')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)`,
      [branch_id]
    );
    queueDepth = queue[0]?.cnt || 0;

    if (queueDepth > 50) baseDays += 3;
    else if (queueDepth > 30) baseDays += 2;
    else if (queueDepth > 15) baseDays += 1;

    // 5. Machine workload assessment
    const [machines] = await pool.query(
      `SELECT COUNT(*) as total FROM sarga_machines WHERE branch_id = ? AND is_active = 1`,
      [branch_id]
    );
    const [activeJobs] = await pool.query(
      `SELECT COUNT(*) as active FROM sarga_jobs
       WHERE branch_id = ? AND status IN ('Printing', 'Processing', 'Designing')`,
      [branch_id]
    );
    const totalMachines = machines[0]?.total || 1;
    const activeCount = activeJobs[0]?.active || 0;
    machineLoad = Math.round((activeCount / totalMachines) * 100);
    if (machineLoad > 80) baseDays += 2;
    else if (machineLoad > 60) baseDays += 1;
  }

  // 6. Apply express override
  const now = new Date();
  const cutoffHour = 17;
  const orderProcessedToday = now.getHours() < cutoffHour;
  const startDate = orderProcessedToday ? now : new Date(now.getTime() + 86400000);

  let estimatedDate;

  if (expressLabels.length > 0) {
    if (expressLabels.includes('Ready in 3 Hours')) {
      estimatedDate = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    } else if (expressLabels.includes('Ready Today')) {
      estimatedDate = now;
    } else {
      estimatedDate = new Date(now.getTime() + 86400000);
    }
    baseDays = 0;
  } else {
    estimatedDate = addWorkingDays(startDate, baseDays);
  }

  const estimatedDateStr = estimatedDate.toLocaleDateString('en-IN', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const cutoffPassed = now.getHours() >= cutoffHour;
  const message = cutoffPassed && expressLabels.length === 0
    ? `Order after ${cutoffHour}:00 PM — will be processed tomorrow. Ready ${estimatedDateStr}`
    : `Estimated ready ${estimatedDateStr}`;

  res.json({
    estimated_date: estimatedDate.toISOString().slice(0, 10),
    estimated_date_formatted: estimatedDateStr,
    base_days: Math.max(0, baseDays),
    queue_depth: queueDepth,
    machine_load_percent: machineLoad,
    capacity_factor: capacityFactor,
    order_before_cutoff: !cutoffPassed,
    express_labels: expressLabels,
    message,
    cutoff_time: `${cutoffHour}:00`,
    note: 'Business days only, excludes Sundays & holidays'
  });
}));

// ─── ADMIN: Manage delivery rules ───
router.get('/delivery/rules', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM sarga_delivery_rules WHERE is_active = 1 ORDER BY product_category');
  res.json({ rules: rows });
}));

router.post('/delivery/rules', asyncHandler(async (req, res) => {
  const { product_category, service_type, base_days, capacity_per_day } = req.body;
  if (!product_category || !service_type) return res.status(400).json({ error: 'product_category and service_type required' });
  const [result] = await pool.query(
    'INSERT INTO sarga_delivery_rules (product_category, service_type, base_days, capacity_per_day) VALUES (?, ?, ?, ?)',
    [product_category, service_type, base_days || 3, capacity_per_day || 50]
  );
  res.status(201).json({ id: result.insertId, message: 'Rule created' });
}));

router.put('/delivery/rules/:id', asyncHandler(async (req, res) => {
  const { base_days, capacity_per_day, is_active, product_category, service_type } = req.body;
  const sets = []; const params = [];
  if (base_days !== undefined) { sets.push('base_days = ?'); params.push(base_days); }
  if (capacity_per_day !== undefined) { sets.push('capacity_per_day = ?'); params.push(capacity_per_day); }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (product_category !== undefined) { sets.push('product_category = ?'); params.push(product_category); }
  if (service_type !== undefined) { sets.push('service_type = ?'); params.push(service_type); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields' });
  params.push(req.params.id);
  await pool.query(`UPDATE sarga_delivery_rules SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ message: 'Rule updated' });
}));

router.delete('/delivery/rules/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM sarga_delivery_rules WHERE id = ?', [req.params.id]);
  res.json({ message: 'Rule deleted' });
}));

module.exports = router;
