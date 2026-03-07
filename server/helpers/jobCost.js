// Job cost and profit calculation utility
const { pool } = require('../database');

// Fetch inventory cost for a given item based on linked product
async function getPaperCost(product_id, quantity) {
    if (!product_id) return 0;
    const [rows] = await pool.query(
        `SELECT i.cost_price FROM sarga_products p
         JOIN sarga_inventory i ON p.inventory_item_id = i.id
         WHERE p.id = ?`, [product_id]
    );
    if (rows.length === 0) return 0;
    return (Number(rows[0].cost_price) || 0) * (Number(quantity) || 1);
}

// Fetch machine cost per unit — returns 0 until a machine cost config table is implemented
// TODO: implement machine_cost_per_unit config and replace this stub
async function getMachineCost(product_id, quantity) {
    return 0;
}

// Fetch labour cost for a job — returns 0 until time-tracking is implemented
// TODO: implement time-tracking table and replace this stub
async function getLabourCost(job_id) {
    return 0;
}

// Main calculation — silently skips DB update if job has no ID (e.g. during creation preview)
async function calculateAndUpdateJobCost(job) {
    const paper_cost = await getPaperCost(job.product_id, job.quantity);
    const machine_cost = await getMachineCost(job.product_id, job.quantity);
    const labour_cost = await getLabourCost(job.id);
    const total_cost = paper_cost + machine_cost + labour_cost;
    const revenue = Number(job.total_amount) || 0;
    const profit = revenue - total_cost;
    const margin = revenue > 0 ? (profit / revenue) : 0;

    if (job.id) {
        try {
            await pool.query(
                `UPDATE sarga_jobs SET paper_cost=?, machine_cost=?, labour_cost=?, total_cost=?, profit=?, margin=? WHERE id=?`,
                [paper_cost, machine_cost, labour_cost, total_cost, profit, margin, job.id]
            );
        } catch (err) {
            // Cost columns may not exist on older schema — safe to ignore
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        }
    }

    return { paper_cost, machine_cost, labour_cost, total_cost, profit, margin };
}

module.exports = { calculateAndUpdateJobCost };