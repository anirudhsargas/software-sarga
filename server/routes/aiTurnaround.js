/**
 * /api/ai/turnaround — ML-powered turnaround time prediction
 *
 * POST /api/ai/turnaround
 * Body: { service_type, quantity, branch_id, current_queue_count? }
 *
 * Calls the Python ML service /predict-turnaround endpoint which uses
 * GradientBoostingRegressor on historical job completion data.
 */
const router = require('express').Router();
const axios = require('../helpers/mlAxios');
const { authenticateToken } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 15_000;

router.post('/',
    authenticateToken,
    async (req, res) => {
        try {
            const { service_type, quantity, branch_id, current_queue_count } = req.body;

            if (!service_type || !branch_id) {
                return res.status(400).json({ error: 'service_type and branch_id are required' });
            }

            const mlRes = await axios.post(`${ML_URL}/predict-turnaround`, {
                service_type,
                quantity: quantity || 1,
                branch_id,
                current_queue_count: current_queue_count ?? null,
            }, {
                timeout: ML_TIMEOUT,
                headers: { 'Content-Type': 'application/json' },
            });

            res.json(mlRes.data);
        } catch (err) {
            console.error('[AI Turnaround] Error:', err.message);
            // Graceful fallback — never break the job form
            const now = new Date();
            const fallbackHours = 24;
            res.json({
                predicted_hours: fallbackHours,
                ready_by: new Date(now.getTime() + fallbackHours * 3600000).toISOString(),
                confidence: 'low',
            });
        }
    }
);

module.exports = router;
