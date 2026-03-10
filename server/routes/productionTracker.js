const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler, getUserBranchId } = require('../helpers');

// Stage ordering for the production pipeline
const PRODUCTION_STAGES = [
  'Pending',
  'Designing',
  'Approval Pending',
  'Printing',
  'Cutting',
  'Lamination',
  'Binding',
  'Production',
  'Processing',
  'Completed',
];

/**
 * GET /production-tracker
 * Returns all active jobs grouped by production stage with timing & staff info.
 * Query: ?branch_id=&search=
 */
router.get('/', authenticateToken,
  asyncHandler(async (req, res) => {
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user.role);
    const branchId = !isPrivileged
      ? await getUserBranchId(req.user.id)
      : req.query.branch_id || null;

    let branchCond = '';
    const params = [];
    if (branchId) {
      branchCond = ' AND j.branch_id = ?';
      params.push(branchId);
    }

    let searchCond = '';
    if (req.query.search) {
      searchCond = ' AND (j.job_name LIKE ? OR j.job_number LIKE ? OR c.name LIKE ?)';
      const q = `%${req.query.search}%`;
      params.push(q, q, q);
    }

    // Active jobs (not delivered/cancelled)
    const [jobs] = await pool.query(`
      SELECT
        j.id, j.job_number, j.job_name, j.category, j.status,
        j.priority, j.quantity,
        j.total_amount, j.advance_paid, j.balance_amount,
        j.delivery_date, j.created_at, j.updated_at,
        j.payment_status,
        COALESCE(c.name, 'Walk-in') AS customer_name,
        c.mobile AS customer_mobile,
        b.name AS branch_name,
        (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ')
         FROM sarga_job_staff_assignments ja
         INNER JOIN sarga_staff s ON ja.staff_id = s.id
         WHERE ja.job_id = j.id AND ja.status != 'Cancelled'
        ) AS assigned_staff,
        (SELECT sh.changed_at FROM sarga_job_status_history sh
         WHERE sh.job_id = j.id AND sh.status = j.status
         ORDER BY sh.changed_at DESC LIMIT 1
        ) AS stage_entered_at
      FROM sarga_jobs j
      LEFT JOIN sarga_customers c ON j.customer_id = c.id
      LEFT JOIN sarga_branches b ON j.branch_id = b.id
      WHERE j.status NOT IN ('Delivered', 'Cancelled')
        ${branchCond}
        ${searchCond}
      ORDER BY
        FIELD(j.priority, 'Urgent', 'High', 'Medium', 'Low'),
        j.delivery_date ASC,
        j.created_at ASC
    `, params);

    // Compute time-in-stage and overdue flag
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const enriched = jobs.map(j => {
      const stageEntered = j.stage_entered_at ? new Date(j.stage_entered_at) : new Date(j.updated_at || j.created_at);
      const hoursInStage = Math.round((now - stageEntered) / (1000 * 60 * 60));

      const isOverdue = j.delivery_date && j.delivery_date < today && j.status !== 'Completed';
      const deliveryDate = j.delivery_date || null;
      let daysUntilDelivery = null;
      if (deliveryDate) {
        daysUntilDelivery = Math.round((new Date(deliveryDate) - now) / (1000 * 60 * 60 * 24));
      }

      return {
        id: j.id,
        job_number: j.job_number,
        job_name: j.job_name,
        category: j.category,
        status: j.status,
        priority: j.priority,
        quantity: j.quantity,
        total_amount: Number(j.total_amount),
        balance_amount: Number(j.balance_amount),
        payment_status: j.payment_status,
        customer_name: j.customer_name,
        customer_mobile: j.customer_mobile,
        branch_name: j.branch_name,
        assigned_staff: j.assigned_staff,
        delivery_date: deliveryDate,
        days_until_delivery: daysUntilDelivery,
        is_overdue: isOverdue,
        hours_in_stage: hoursInStage,
        created_at: j.created_at,
      };
    });

    // Group by stage
    const stageGroups = {};
    for (const stage of PRODUCTION_STAGES) {
      stageGroups[stage] = [];
    }
    for (const job of enriched) {
      const stage = PRODUCTION_STAGES.includes(job.status) ? job.status : 'Processing';
      if (!stageGroups[stage]) stageGroups[stage] = [];
      stageGroups[stage].push(job);
    }

    // Summary counts
    const stageCounts = {};
    for (const [stage, jobs] of Object.entries(stageGroups)) {
      if (jobs.length > 0) stageCounts[stage] = jobs.length;
    }

    const totalActive = enriched.length;
    const overdueCount = enriched.filter(j => j.is_overdue).length;
    const urgentCount = enriched.filter(j => j.priority === 'Urgent' || j.priority === 'High').length;

    res.json({
      stages: stageGroups,
      stage_order: PRODUCTION_STAGES.filter(s => stageGroups[s]?.length > 0),
      summary: {
        total_active: totalActive,
        overdue: overdueCount,
        urgent: urgentCount,
        stage_counts: stageCounts,
      },
    });
  })
);

module.exports = router;
