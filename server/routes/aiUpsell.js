/**
 * /api/ai/upsell — ML-powered upsell suggestions (Apriori)
 *
 * POST /api/ai/upsell
 * Body: { current_services: ["Offset Printing"], branch_id: 1 }
 *
 * Calls the Python ML service /upsell-suggestions endpoint which runs
 * Apriori association rules on historical job data.
 */
const router = require('express').Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 15_000;

router.post('/upsell',
    authenticateToken,
    async (req, res) => {
        try {
            const { current_services, branch_id } = req.body;

            if (!current_services || !Array.isArray(current_services) || current_services.length === 0) {
                return res.json({ suggestions: [] });
            }

            const mlRes = await axios.post(`${ML_URL}/upsell-suggestions`, {
                current_services,
                branch_id: branch_id || null,
            }, {
                timeout: ML_TIMEOUT,
                headers: { 'Content-Type': 'application/json' },
            });

            res.json(mlRes.data);
        } catch (err) {
            console.error('[AI Upsell] Error:', err.message);
            // Never fail the billing flow — just return empty
            res.json({ suggestions: [] });
        }
    }
);

module.exports = router;
