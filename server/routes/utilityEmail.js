const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { runNow } = require('../services/billScheduler');

// Manual trigger to fetch utility bills from email
router.post('/utility-bills/fetch-from-email', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const report = await runNow();
    res.json({ success: true, report });
  } catch (err) {
    console.error('Manual bill fetch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

module.exports = router;
