// Job cost and profit calculation utility
const { pool } = require('../database');

// Fetch inventory cost for a given item
async function getPaperCost(product_id, quantity) {
    // Example: fetch inventory item linked to product and get cost_price
    const [rows] = await pool.query(
        `SELECT i.cost_price FROM sarga_products p
         JOIN sarga_inventory i ON p.inventory_item_id = i.id
         WHERE p.id = ?`, [product_id]
    );
    if (rows.length === 0) return 0;
    return (rows[0].cost_price || 0) * (quantity || 1);
}

// Fetch machine cost for a job (stub: can be enhanced)
async function getMachineCost(product_id, quantity) {
    // Example: assign a flat rate per job or per unit
    // You can enhance this to fetch from a machine config table
    const ratePerUnit = 2; // Example: Rs.2 per unit
    return ratePerUnit * (quantity || 1);
}

// Fetch labour cost for a job (stub: can be enhanced)
async function getLabourCost(job_id) {
    // Example: sum time spent by staff * hourly rate
    // For now, return a flat value
    const hourlyRate = 50; // Rs.50/hour
    // You can enhance this to calculate from assignments
    return hourlyRate; // Placeholder
}

// Main calculation
async function calculateAndUpdateJobCost(job) {
    const paper_cost = await getPaperCost(job.product_id, job.quantity);
    const machine_cost = await getMachineCost(job.product_id, job.quantity);
    const labour_cost = await getLabourCost(job.id);
    const total_cost = paper_cost + machine_cost + labour_cost;
    const profit = (job.total_amount || 0) - total_cost;
    const margin = (job.total_amount && job.total_amount > 0) ? (profit / job.total_amount) : 0;

    await pool.query(
        `UPDATE sarga_jobs SET paper_cost=?, machine_cost=?, labour_cost=?, total_cost=?, profit=?, margin=? WHERE id=?`,
        [paper_cost, machine_cost, labour_cost, total_cost, profit, margin, job.id]
    );
    return { paper_cost, machine_cost, labour_cost, total_cost, profit, margin };
}

module.exports = { calculateAndUpdateJobCost };