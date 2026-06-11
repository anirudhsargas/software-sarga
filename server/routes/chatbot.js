const router = require('express').Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../helpers/logger');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';

/**
 * Proxy all /api/chatbot/* endpoints directly to the Python Flask ML service.
 * These endpoints are used for chatbot training, labeling, status updates, and logs.
 * All of them are protected by authenticateToken.
 */
router.all('*', authenticateToken, async (req, res) => {
  const targetUrl = `${ML_URL}/api/chatbot${req.path}`;
  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      params: req.query,
      data: req.body,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
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
