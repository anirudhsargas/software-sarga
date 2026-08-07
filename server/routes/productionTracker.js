const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles: _authorizeRoles } = require('../middleware/auth');
const { asyncHandler, getTodayDate } = require('../helpers');
const { branchFilter } = require('../middleware/branchFilter');

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
    const branchScope = await branchFilter(req, { column: 'j.branch_id' });
    const branchCond = branchScope.clause;
    const params = [...branchScope.params];

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
    const today = getTodayDate();

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

    // Summary counts & Bottleneck detection
    const stageCounts = {};
    let totalPipelineValue = 0;
    let totalUnpaidBalance = 0;
    let bottleneckStage = null;
    let maxStageHoursAvg = 0;

    for (const [stage, stageJobs] of Object.entries(stageGroups)) {
      if (stageJobs.length > 0) {
        stageCounts[stage] = stageJobs.length;
        const stageTotalHours = stageJobs.reduce((acc, j) => acc + (j.hours_in_stage || 0), 0);
        const avgHours = stageTotalHours / stageJobs.length;

        // Bottleneck criteria: non-completed stage with highest average hours in stage
        if (stage !== 'Completed' && (avgHours > maxStageHoursAvg || (avgHours === maxStageHoursAvg && stageJobs.length > (stageGroups[bottleneckStage]?.length || 0)))) {
          maxStageHoursAvg = avgHours;
          bottleneckStage = stage;
        }
      }
    }

    for (const j of enriched) {
      totalPipelineValue += j.total_amount || 0;
      totalUnpaidBalance += j.balance_amount || 0;
    }

    const totalActive = enriched.length;
    const overdueCount = enriched.filter(j => j.is_overdue).length;
    const urgentCount = enriched.filter(j => j.priority === 'Urgent' || j.priority === 'High').length;

    res.json({
      stages: stageGroups,
      stage_order: PRODUCTION_STAGES.filter(s => stageGroups[s]?.length > 0),
      all_stages: PRODUCTION_STAGES,
      summary: {
        total_active: totalActive,
        overdue: overdueCount,
        urgent: urgentCount,
        stage_counts: stageCounts,
        total_revenue: totalPipelineValue,
        total_unpaid: totalUnpaidBalance,
        bottleneck_stage: bottleneckStage,
        bottleneck_avg_hours: Math.round(maxStageHoursAvg),
      },
    });
  })
);

/**
 * PATCH /production-tracker/:id/status
 * Quick update stage status for a job
 */
router.patch('/:id/status', authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || (!PRODUCTION_STAGES.includes(status) && status !== 'Delivered' && status !== 'Cancelled')) {
      return res.status(400).json({ error: 'Invalid or missing status stage' });
    }

    const [existing] = await pool.query('SELECT id, status, job_number, job_name FROM sarga_jobs WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const oldStatus = existing[0].status;
    if (oldStatus === status) {
      return res.json({ success: true, message: 'Status is already set to ' + status });
    }

    await pool.query(
      'UPDATE sarga_jobs SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    // Record status history if table exists
    try {
      await pool.query(
        'INSERT INTO sarga_job_status_history (job_id, status, changed_at, changed_by) VALUES (?, ?, NOW(), ?)',
        [id, status, req.user?.id || null]
      );
    } catch (_) {
      // Ignore if table/columns differ
    }

    res.json({
      success: true,
      message: `Job #${existing[0].job_number} updated from ${oldStatus} to ${status}`,
      oldStatus,
      newStatus: status,
    });
  })
);

module.exports = router;

