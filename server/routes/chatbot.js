const router = require('express').Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../helpers/logger');
const { pool } = require('../database');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const DEFAULT_MODEL = process.env.CHATBOT_MODEL || 'current-model';

const normalizeCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (data = {}, source = 'local') => ({
  success: data?.success !== false,
  loaded: data?.loaded !== false,
  provider: data?.provider || source,
  model: data?.model || DEFAULT_MODEL,
  healthy: data?.healthy !== false && data?.success !== false,
  meta: data?.meta || {},
  unlabeled: normalizeCount(data?.unlabeled),
  pending: normalizeCount(data?.pending),
  training_examples_total: normalizeCount(data?.training_examples_total)
});

async function fetchMlModelStatus() {
  try {
    const response = await axios.get(`${ML_URL}/api/chatbot/model-status`, { timeout: 5000 });
    logger.info('[Chatbot] ML model-status fetched successfully');
    return normalizeStatus({
      ...response.data,
      provider: 'ml',
      model: response.data?.meta?.model || response.data?.meta?.model_name || DEFAULT_MODEL,
      loaded: !response.data?.meta?.error,
      healthy: response.status === 200
    }, 'ml');
  } catch (err) {
    logger.warn(`[Chatbot] ML model-status unavailable (${err.response?.status || err.code || 'UNKNOWN'}): ${err.message}`);
    return null;
  }
}

async function fetchLocalCounts() {
  try {
    const [unlabeled] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM chatbot_logs WHERE correct_intent IS NULL'
    );
    const [pending] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM chatbot_logs WHERE correct_intent IS NOT NULL AND is_trained = FALSE'
    );
    const [total] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM training_examples'
    );

    logger.info('[Chatbot] Local model-status counts fetched');
    return {
      success: true,
      loaded: true,
      provider: 'local',
      model: DEFAULT_MODEL,
      healthy: true,
      meta: {},
      unlabeled: normalizeCount(unlabeled?.[0]?.cnt),
      pending: normalizeCount(pending?.[0]?.cnt),
      training_examples_total: normalizeCount(total?.[0]?.cnt)
    };
  } catch (err) {
    logger.warn('[Chatbot] Local model-status DB queries failed (tables may be missing):', err.message);
    return {
      success: true,
      loaded: true,
      provider: 'local',
      model: DEFAULT_MODEL,
      healthy: true,
      meta: {},
      unlabeled: 0,
      pending: 0,
      training_examples_total: 0
    };
  }
}

async function getModelStatus() {
  const mlStatus = await fetchMlModelStatus();
  if (mlStatus) return mlStatus;

  logger.warn('[Chatbot] Falling back to local model-status');
  return fetchLocalCounts();
}

router.get('/health', async (req, res) => {
  try {
    const status = await getModelStatus();
    const healthy = status.loaded === true && status.healthy === true;
    logger.info(`[Chatbot] health provider=${status.provider} model=${status.model} healthy=${healthy}`);
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      loaded: status.loaded,
      provider: status.provider,
      model: status.model,
      healthy,
      status,
      time: new Date().toISOString()
    });
  } catch (err) {
    logger.error('[Chatbot] health check failed:', err.message);
    return res.status(503).json({
      success: false,
      loaded: false,
      provider: 'local',
      model: DEFAULT_MODEL,
      healthy: false,
      error: 'Chatbot health check failed',
      time: new Date().toISOString()
    });
  }
});

router.get('/model-status', authenticateToken, async (req, res) => {
  try {
    const status = await getModelStatus();
    logger.info(`[Chatbot] model-status provider=${status.provider} model=${status.model} healthy=${status.healthy}`);
    return res.json(status);
  } catch (err) {
    logger.error('[Chatbot] model-status failed:', err.message);
    return res.status(503).json({
      success: false,
      loaded: false,
      provider: 'local',
      model: DEFAULT_MODEL,
      healthy: false,
      error: 'Chatbot model status unavailable'
    });
  }
});

// Fallback for when the router is mounted at /api instead of /api/chatbot
router.get('/chatbot/model-status', authenticateToken, async (req, res) => {
  try {
    const status = await getModelStatus();
    logger.info(`[Chatbot] model-status provider=${status.provider} model=${status.model} healthy=${status.healthy}`);
    return res.json(status);
  } catch (err) {
    logger.error('[Chatbot] model-status failed:', err.message);
    return res.status(503).json({
      success: false,
      loaded: false,
      provider: 'local',
      model: DEFAULT_MODEL,
      healthy: false,
      error: 'Chatbot model status unavailable'
    });
  }
});

router.all('/*path', authenticateToken, async (req, res) => {
  const targetUrl = `${ML_URL}/api/chatbot${req.path}`;
  try {
    logger.info(`[Chatbot Proxy] Forwarding ${req.method} ${req.path} to ${targetUrl}`);
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
