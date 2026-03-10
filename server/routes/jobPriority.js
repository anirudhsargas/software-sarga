const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');

// ───────────────────── Priority Scoring Engine ─────────────────────
//
// Score = deliveryUrgency + sizeWeight + customerWeight + priorityWeight
//         + paymentBonus + ageBonus
//
// Higher score = should be printed first.
// ────────────────────────────────────────────────────────────────────

function computePriorityScore(job, now = new Date()) {
    let score = 0;
    const reasons = [];

    // 1. Delivery Urgency (0-60 points)
    if (job.delivery_date) {
        const delivery = new Date(job.delivery_date);
        const hoursLeft = (delivery - now) / (1000 * 60 * 60);

        if (hoursLeft <= 0) {
            score += 60;
            reasons.push('OVERDUE');
        } else if (hoursLeft <= 3) {
            score += 55;
            reasons.push('Due in <3 hrs');
        } else if (hoursLeft <= 6) {
            score += 50;
            reasons.push('Due in <6 hrs');
        } else if (hoursLeft <= 12) {
            score += 40;
            reasons.push('Due today');
        } else if (hoursLeft <= 24) {
            score += 30;
            reasons.push('Due tomorrow');
        } else if (hoursLeft <= 48) {
            score += 20;
            reasons.push('Due in 2 days');
        } else if (hoursLeft <= 72) {
            score += 10;
            reasons.push('Due in 3 days');
        } else {
            score += 5;
            reasons.push('Due later');
        }
    } else {
        score += 15; // No delivery date — treat as moderate urgency
        reasons.push('No delivery date');
    }

    // 2. Job Size Weight (0-20 points)
    const amount = Number(job.total_amount) || 0;
    if (amount >= 10000) {
        score += 20;
        reasons.push('High-value order');
    } else if (amount >= 5000) {
        score += 15;
        reasons.push('Medium-value order');
    } else if (amount >= 1000) {
        score += 10;
        reasons.push('Standard order');
    } else {
        score += 5;
        reasons.push('Small order');
    }

    // 3. Customer Type Weight (0-15 points)
    const custType = (job.customer_type || '').toLowerCase();
    if (custType === 'association' || custType === 'offset') {
        score += 15;
        reasons.push('VIP/Association customer');
    } else if (custType === 'retail') {
        score += 10;
        reasons.push('Retail customer');
    } else {
        score += 5;
        reasons.push('Walk-in customer');
    }

    // 4. Manual Priority Override (0-25 points)
    const priority = (job.priority || 'Medium').toLowerCase();
    if (priority === 'urgent') {
        score += 25;
        reasons.push('Flagged URGENT');
    } else if (priority === 'high') {
        score += 18;
        reasons.push('High priority set');
    } else if (priority === 'medium') {
        score += 10;
        reasons.push('Normal priority');
    } else {
        score += 3;
        reasons.push('Low priority set');
    }

    // 5. Payment Status Bonus (0-10 points)
    if (job.payment_status === 'Paid') {
        score += 10;
        reasons.push('Fully paid');
    } else if (job.payment_status === 'Partial') {
        score += 5;
        reasons.push('Partial payment');
    } else {
        score += 0;
        reasons.push('Unpaid');
    }

    // 6. Age Bonus — older pending jobs get slight bump (0-10 points)
    if (job.created_at) {
        const ageHours = (now - new Date(job.created_at)) / (1000 * 60 * 60);
        if (ageHours > 72) {
            score += 10;
            reasons.push('Waiting 3+ days');
        } else if (ageHours > 48) {
            score += 7;
            reasons.push('Waiting 2+ days');
        } else if (ageHours > 24) {
            score += 4;
            reasons.push('Waiting 1+ day');
        }
    }

    // Determine urgency tier
    let urgency;
    if (score >= 100) urgency = 'critical';
    else if (score >= 75) urgency = 'high';
    else if (score >= 50) urgency = 'medium';
    else urgency = 'low';

    return { score, urgency, reasons };
}

// ───────── GET /job-priority/queue — Full prioritized queue ─────────
router.get('/queue', authenticateToken, async (req, res) => {
    try {
        const { branch_id } = req.query;

        let branchFilter = '';
        const params = [];
        if (branch_id) {
            branchFilter = ' AND j.branch_id = ?';
            params.push(branch_id);
        }

        // Fetch active (non-completed/cancelled/delivered) jobs with customer & machine info
        const [jobs] = await pool.query(`
            SELECT j.id, j.job_number, j.job_name, j.description, j.quantity,
                   j.total_amount, j.status, j.payment_status, j.priority,
                   j.delivery_date, j.machine_id, j.category, j.subcategory,
                   j.created_at, j.customer_id,
                   COALESCE(c.name, 'Walk-in') AS customer_name,
                   c.type AS customer_type,
                   c.mobile AS customer_mobile,
                   m.machine_name, m.machine_type,
                   b.name AS branch_name
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            LEFT JOIN sarga_machines m ON j.machine_id = m.id
            LEFT JOIN sarga_branches b ON j.branch_id = b.id
            WHERE j.status IN ('Pending', 'Processing')
            ${branchFilter}
            ORDER BY j.created_at ASC
        `, params);

        const now = new Date();

        // Score each job
        const scored = jobs.map(job => {
            const { score, urgency, reasons } = computePriorityScore(job, now);
            return { ...job, priority_score: score, urgency, score_reasons: reasons };
        });

        // Sort descending by score
        scored.sort((a, b) => b.priority_score - a.priority_score);

        // Group by machine
        const machineQueues = {};
        const unassigned = [];

        scored.forEach(job => {
            if (job.machine_id && job.machine_name) {
                const key = job.machine_id;
                if (!machineQueues[key]) {
                    machineQueues[key] = {
                        machine_id: job.machine_id,
                        machine_name: job.machine_name,
                        machine_type: job.machine_type,
                        jobs: []
                    };
                }
                machineQueues[key].jobs.push(job);
            } else {
                unassigned.push(job);
            }
        });

        // Fetch active machines to include empty ones
        const machineParams = [];
        let machineWhere = 'WHERE m.is_active = 1';
        if (branch_id) {
            machineWhere += ' AND m.branch_id = ?';
            machineParams.push(branch_id);
        }
        const [machines] = await pool.query(`
            SELECT m.id, m.machine_name, m.machine_type, b.name AS branch_name
            FROM sarga_machines m
            LEFT JOIN sarga_branches b ON m.branch_id = b.id
            ${machineWhere}
            ORDER BY m.machine_name ASC
        `, machineParams);

        // Build final queue list (include machines with no jobs)
        const queues = machines.map(m => {
            const q = machineQueues[m.id] || { machine_id: m.id, machine_name: m.machine_name, machine_type: m.machine_type, jobs: [] };
            return q;
        });

        // Summary stats
        const totalJobs = scored.length;
        const criticalCount = scored.filter(j => j.urgency === 'critical').length;
        const highCount = scored.filter(j => j.urgency === 'high').length;
        const overdueCount = scored.filter(j => j.score_reasons.includes('OVERDUE')).length;

        res.json({
            queues,
            unassigned,
            summary: {
                total_active_jobs: totalJobs,
                critical: criticalCount,
                high: highCount,
                medium: scored.filter(j => j.urgency === 'medium').length,
                low: scored.filter(j => j.urgency === 'low').length,
                overdue: overdueCount,
                unassigned: unassigned.length
            },
            generated_at: now.toISOString()
        });
    } catch (err) {
        console.error('Job priority queue error:', err);
        res.status(500).json({ message: 'Failed to compute priority queue' });
    }
});

// ─────── GET /job-priority/machine/:id — Single machine queue ───────
router.get('/machine/:id', authenticateToken, async (req, res) => {
    try {
        const machineId = req.params.id;

        // Machine info
        const [machines] = await pool.query(`
            SELECT m.*, b.name AS branch_name
            FROM sarga_machines m
            LEFT JOIN sarga_branches b ON m.branch_id = b.id
            WHERE m.id = ?
        `, [machineId]);

        if (machines.length === 0) {
            return res.status(404).json({ message: 'Machine not found' });
        }

        const machine = machines[0];

        // Active jobs on this machine
        const [jobs] = await pool.query(`
            SELECT j.id, j.job_number, j.job_name, j.description, j.quantity,
                   j.total_amount, j.status, j.payment_status, j.priority,
                   j.delivery_date, j.machine_id, j.category, j.subcategory,
                   j.created_at, j.customer_id,
                   COALESCE(c.name, 'Walk-in') AS customer_name,
                   c.type AS customer_type,
                   c.mobile AS customer_mobile
            FROM sarga_jobs j
            LEFT JOIN sarga_customers c ON j.customer_id = c.id
            WHERE j.machine_id = ? AND j.status IN ('Pending', 'Processing')
            ORDER BY j.created_at ASC
        `, [machineId]);

        const now = new Date();
        const scored = jobs.map(job => {
            const { score, urgency, reasons } = computePriorityScore(job, now);
            return { ...job, priority_score: score, urgency, score_reasons: reasons };
        });
        scored.sort((a, b) => b.priority_score - a.priority_score);

        // Estimated time: assume 15 min per job (simplistic)
        let runningMinutes = 0;
        const withEta = scored.map((job, idx) => {
            const eta = new Date(now.getTime() + runningMinutes * 60 * 1000);
            const estMinutes = Math.max(10, Math.ceil((Number(job.quantity) || 1) * 2));
            runningMinutes += estMinutes;
            return { ...job, queue_position: idx + 1, estimated_start: eta.toISOString(), est_duration_min: estMinutes };
        });

        res.json({
            machine,
            jobs: withEta,
            total: withEta.length,
            generated_at: now.toISOString()
        });
    } catch (err) {
        console.error('Machine priority queue error:', err);
        res.status(500).json({ message: 'Failed to compute machine queue' });
    }
});

// ─────── POST /job-priority/override — Manual priority override ───────
router.post('/override', authenticateToken, authorizeRoles('Admin', 'Front Office', 'Accountant'), async (req, res) => {
    try {
        const { job_id, priority } = req.body;
        const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];

        if (!job_id) return res.status(400).json({ message: 'job_id is required' });
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({ message: `priority must be one of: ${validPriorities.join(', ')}` });
        }

        const [result] = await pool.query(
            'UPDATE sarga_jobs SET priority = ? WHERE id = ?',
            [priority, job_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Job not found' });
        }

        auditLog(req.user.id, 'JOB_PRIORITY_OVERRIDE', `Set job #${job_id} priority to ${priority}`, { entity_type: 'job', entity_id: job_id });
        res.json({ message: `Job #${job_id} priority set to ${priority}` });
    } catch (err) {
        console.error('Priority override error:', err);
        res.status(500).json({ message: 'Failed to update priority' });
    }
});

// ─────── GET /job-priority/stats — Historical performance stats ───────
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const { days = 30 } = req.query;

        // Average completion time by machine type
        const [avgCompletion] = await pool.query(`
            SELECT m.machine_type,
                   COUNT(j.id) AS completed_jobs,
                   ROUND(AVG(TIMESTAMPDIFF(HOUR, j.created_at, j.updated_at)), 1) AS avg_hours_to_complete
            FROM sarga_jobs j
            JOIN sarga_machines m ON j.machine_id = m.id
            WHERE j.status = 'Completed'
              AND j.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY m.machine_type
        `, [Number(days)]);

        // On-time vs late delivery
        const [deliveryStats] = await pool.query(`
            SELECT 
                COUNT(*) AS total_delivered,
                SUM(CASE WHEN j.updated_at <= j.delivery_date THEN 1 ELSE 0 END) AS on_time,
                SUM(CASE WHEN j.updated_at > j.delivery_date THEN 1 ELSE 0 END) AS late
            FROM sarga_jobs j
            WHERE j.status IN ('Completed', 'Delivered')
              AND j.delivery_date IS NOT NULL
              AND j.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [Number(days)]);

        // Jobs per machine (last N days)
        const [machineLoad] = await pool.query(`
            SELECT m.id AS machine_id, m.machine_name, m.machine_type,
                   COUNT(j.id) AS jobs_completed,
                   SUM(j.total_amount) AS revenue
            FROM sarga_machines m
            LEFT JOIN sarga_jobs j ON j.machine_id = m.id 
                AND j.status IN ('Completed', 'Delivered')
                AND j.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE m.is_active = 1
            GROUP BY m.id
            ORDER BY jobs_completed DESC
        `, [Number(days)]);

        res.json({
            period_days: Number(days),
            avg_completion_by_type: avgCompletion,
            delivery_performance: deliveryStats[0] || { total_delivered: 0, on_time: 0, late: 0 },
            machine_load: machineLoad
        });
    } catch (err) {
        console.error('Priority stats error:', err);
        res.status(500).json({ message: 'Failed to fetch stats' });
    }
});

module.exports = router;
