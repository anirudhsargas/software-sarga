const router = require('express').Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../helpers/logger');
const { pool } = require('../database');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';

/**
 * Model status — try ML service first, fall back to local DB query.
 */
router.get('/model-status', authenticateToken, async (req, res) => {
  try {
    const response = await axios({
      method: 'GET',
      url: `${ML_URL}/api/chatbot/model-status`,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    logger.warn('[Chatbot] ML service unreachable, using local DB fallback for model-status');
    try {
      const [unlabeled] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM chatbot_logs WHERE correct_intent IS NULL`
      );
      const [pending] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM chatbot_logs WHERE correct_intent IS NOT NULL AND is_trained = FALSE`
      );
      const [total] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM training_examples`
      );
      return res.json({
        meta: {},
        unlabeled: unlabeled?.[0]?.cnt || 0,
        pending: pending?.[0]?.cnt || 0,
        training_examples_total: total?.[0]?.cnt || 0
      });
    } catch (dbErr) {
      logger.error('[Chatbot] Local DB fallback also failed:', dbErr.message);
      return res.json({
        meta: {},
        unlabeled: 0,
        pending: 0,
        training_examples_total: 0
      });
    }
  }
});

/**
 * Proxy all other /api/chatbot/* endpoints directly to the Python Flask ML service.
 */
router.all('/*path', authenticateToken, async (req, res) => {
  const targetUrl = `${ML_URL}/api/chatbot${req.path}`;
  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      params: req.query,
      data: req.body,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    logger.error(`[Chatbot Proxy] Error forwarding to ${targetUrl}:`, err.message);
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: 'Chatbot service unreachable' });
  }
});

module.exports = router;
