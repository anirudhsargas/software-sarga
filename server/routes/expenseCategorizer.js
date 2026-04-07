/**
 * /api/ai/categorize-expense — ML expense category prediction
 *
 * POST /  → forwards OCR text to Python ML service, returns predicted category
 * POST /feedback → saves user correction to training table for future model improvement
 */
const router = require('express').Router();
const axios = require('axios');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const ML_TIMEOUT = 15_000;

// POST /api/ai/categorize-expense
router.post('/',
    authenticateToken,
    async (req, res) => {
        try {
            const { ocr_text } = req.body;

            if (!ocr_text || !String(ocr_text).trim()) {
                return res.status(400).json({ error: 'ocr_text is required' });
            }

            const mlRes = await axios.post(`${ML_URL}/categorize-expense`, {
                ocr_text: String(ocr_text).trim(),
            }, {
                timeout: ML_TIMEOUT,
                headers: { 'Content-Type': 'application/json' },
            });

            res.json(mlRes.data);
        } catch (err) {
            console.error('[AI ExpenseCategorizer] Error:', err.message);
            // Graceful fallback — never break the upload flow
            res.json({
                predicted_category: null,
                confidence: 0,
                alternatives: [],
                fallback: true,
            });
        }
    }
);

// POST /api/ai/categorize-expense/feedback — save user correction
router.post('/feedback',
    authenticateToken,
    async (req, res) => {
        try {
            const { ocr_text, category } = req.body;

            if (!ocr_text || !category) {
                return res.status(400).json({ error: 'ocr_text and category are required' });
            }

            const safeText = String(ocr_text).trim().slice(0, 5000);
            const safeCat = String(category).trim().slice(0, 150);

            await pool.query(
                'INSERT INTO sarga_expense_training (ocr_text, category) VALUES (?, ?)',
                [safeText, safeCat]
            );

            res.json({ saved: true });
        } catch (err) {
            console.error('[AI ExpenseCategorizer] Feedback save error:', err.message);
            res.status(500).json({ error: 'Failed to save feedback' });
        }
    }
);

module.exports = router;
