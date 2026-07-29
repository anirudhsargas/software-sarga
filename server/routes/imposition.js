const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, asyncHandler } = require('../helpers');
const { calculateImposition, suggestQuantityBreakpoints } = require('../services/impositionCalculator');

// GET /api/press-sheets — list active press sheets, optionally filtered by branch_id
router.get('/press-sheets', authenticateToken, asyncHandler(async (req, res) => {
  const { branch_id } = req.query;
  let rows;
  if (branch_id) {
    [rows] = await pool.query(
      'SELECT * FROM press_sheets WHERE is_active = 1 AND (branch_id IS NULL OR branch_id = ?) ORDER BY name',
      [branch_id]
    );
  } else {
    [rows] = await pool.query('SELECT * FROM press_sheets WHERE is_active = 1 ORDER BY name');
  }
  res.json(rows);
}));

// POST /api/imposition/calculate — live what-if calculator, does NOT persist
router.post('/imposition/calculate', authenticateToken, asyncHandler(async (req, res) => {
  const { press_sheet_id, trim_width_mm, trim_height_mm, bleed_mm, gutter_mm, order_qty } = req.body;

  if (!press_sheet_id || !trim_width_mm || !trim_height_mm || !order_qty) {
    return res.status(400).json({ message: 'press_sheet_id, trim_width_mm, trim_height_mm, and order_qty are required' });
  }

  const [sheets] = await pool.query('SELECT * FROM press_sheets WHERE id = ? AND is_active = 1', [press_sheet_id]);
  if (!sheets.length) {
    return res.status(404).json({ message: 'Press sheet not found' });
  }

  const sheet = sheets[0];
  const bleed = parseFloat(bleed_mm) || 3;
  const gutter = parseFloat(gutter_mm) || 4;

  const result = calculateImposition({
    sheetWidth: parseFloat(sheet.width_mm),
    sheetHeight: parseFloat(sheet.height_mm),
    gripperMargin: parseFloat(sheet.gripper_margin_mm),
    sideMargin: parseFloat(sheet.side_margin_mm),
    trimWidth: parseFloat(trim_width_mm),
    trimHeight: parseFloat(trim_height_mm),
    bleed,
    gutter,
  });

  const qty = parseInt(order_qty, 10);
  const breakpoints = suggestQuantityBreakpoints({ nUp: result.best.nUp, orderQty: qty });

  res.json({
    press_sheet: {
      id: sheet.id,
      name: sheet.name,
      width_mm: parseFloat(sheet.width_mm),
      height_mm: parseFloat(sheet.height_mm),
      gripper_margin_mm: parseFloat(sheet.gripper_margin_mm),
      side_margin_mm: parseFloat(sheet.side_margin_mm),
    },
    imposition: result,
    quantity: breakpoints,
  });
}));

// POST /api/imposition/plans — persist a chosen plan
router.post('/imposition/plans', authenticateToken, asyncHandler(async (req, res) => {
  const { job_id, press_sheet_id, trim_width_mm, trim_height_mm, bleed_mm, gutter_mm, orientation, order_qty, sheets_required, yield_qty, spoilage_qty, n_up } = req.body;

  if (!press_sheet_id || !trim_width_mm || !trim_height_mm || !orientation || !order_qty || !n_up) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const [result] = await pool.query(
    `INSERT INTO imposition_plans (job_id, press_sheet_id, trim_width_mm, trim_height_mm, bleed_mm, gutter_mm, orientation, n_up, order_qty, sheets_required, yield_qty, spoilage_qty, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [job_id || null, press_sheet_id, trim_width_mm, trim_height_mm, bleed_mm || 3, gutter_mm || 4, orientation, n_up, order_qty, sheets_required, yield_qty, spoilage_qty, req.user.id]
  );

  auditLog(req.user.id, 'IMPOSITION_PLAN_SAVE', `Saved imposition plan #${result.insertId} for job #${job_id || 'none'} (${n_up}-up ${orientation})`, {
    entity_type: 'imposition_plan', entity_id: result.insertId
  });

  res.status(201).json({ id: result.insertId, message: 'Imposition plan saved' });
}));

// GET /api/imposition/plans/:job_id — fetch saved plans for a job
router.get('/imposition/plans/:job_id', authenticateToken, asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.job_id, 10);
  if (!Number.isFinite(jobId)) return res.status(400).json({ message: 'Invalid job id' });

  const [rows] = await pool.query(
    `SELECT p.*, s.name AS press_sheet_name, s.width_mm, s.height_mm
     FROM imposition_plans p
     JOIN press_sheets s ON p.press_sheet_id = s.id
     WHERE p.job_id = ?
     ORDER BY p.created_at DESC`,
    [jobId]
  );
  res.json(rows);
}));

module.exports = router;
