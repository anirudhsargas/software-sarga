const { pool } = require('../database');

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

async function getMachineCost(_product_id, _quantity) {
    return 0;
}

async function getLabourCost(_job_id) {
    return 0;
}

// Calculate consumable cost for a job from job_consumable_usage
async function getConsumableCost(job_id) {
    if (!job_id) return 0;
    try {
        const [[result]] = await pool.query(
            'SELECT COALESCE(SUM(total_cost), 0) as total FROM job_consumable_usage WHERE job_id = ?',
            [job_id]
        );
        return Number(result?.total || 0);
    } catch {
        return 0;
    }
}

// Get current rate for a consumable (returns rate per unit)
async function getConsumableCurrentRate(consumable_id) {
    try {
        const [[item]] = await pool.query(
            `SELECT c.unit_cost, c.unit FROM consumables_inventory c WHERE c.id = ?`,
            [consumable_id]
        );
        if (!item) return { rate: 0, unit: 'piece' };
        return { rate: Number(item.unit_cost) || 0, unit: item.unit };
    } catch {
        return { rate: 0, unit: 'piece' };
    }
}

async function calculateAndUpdateJobCost(job) {
    const paper_cost = await getPaperCost(job.product_id, job.quantity);
    const machine_cost = await getMachineCost(job.product_id, job.quantity);
    const labour_cost = await getLabourCost(job.id);
    const consumable_cost = await getConsumableCost(job.id);
    const total_cost = paper_cost + machine_cost + labour_cost + consumable_cost;
    const revenue = Number(job.total_amount) || 0;
    const profit = revenue - total_cost;
    const margin = revenue > 0 ? (profit / revenue) : 0;

    if (job.id) {
        try {
            await pool.query(
                `UPDATE sarga_jobs SET paper_cost=?, machine_cost=?, labour_cost=?, consumable_cost=?, total_cost=?, profit=?, margin=? WHERE id=?`,
                [paper_cost, machine_cost, labour_cost, consumable_cost, total_cost, profit, margin, job.id]
            );
        } catch (err) {
            if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        }
    }

    return { paper_cost, machine_cost, labour_cost, consumable_cost, total_cost, profit, margin };
}

module.exports = { calculateAndUpdateJobCost, getConsumableCurrentRate, getConsumableCost };
