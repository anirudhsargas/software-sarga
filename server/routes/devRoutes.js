const router = require('express').Router();
const { pool } = require('../database');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../helpers');

// Development-only routes to aid UI testing without auth.
// These are only intended for local development and should not be enabled in production.

router.get('/inventory/consumables', async (req, res) => {
    try {
        const { category, branch, search } = req.query;
        let query = 'SELECT id, name, category, quantity, unit, reorder_level, cost_price, sell_price, branch, created_at, updated_at FROM consumables_inventory WHERE 1=1';
        const params = [];
        if (category && category !== 'all') {
            query += ' AND category = ?';
            params.push(category);
        }
        if (branch && branch !== 'All') {
            query += ' AND branch = ?';
            params.push(branch);
        }
        if (search) {
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }
        query += ' ORDER BY name ASC LIMIT 200';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Dev consumables fetch error:', err);
        res.status(500).json({ message: 'Dev: failed to fetch consumables' });
    }
});

// Development helper: create a temporary admin token for local testing
// Usage: GET /api/dev/token
// SECURITY: This endpoint is ONLY enabled when both NODE_ENV=development AND ENABLE_DEV_TOKEN=1 are set.
router.get('/token', (req, res) => {
    try {
        if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_DEV_TOKEN !== '1') {
            return res.status(404).json({ message: 'Not found' });
        }
        if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'JWT not configured' });
        const payload = {
            id: 1,
            role: 'Admin',
            branch_name: 'Perambra',
            iat: Math.floor(Date.now() / 1000)
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: 1, role: 'Admin', branch_name: 'Perambra', name: 'Dev Admin' } });
    } catch (err) {
        console.error('Dev token error:', err);
        res.status(500).json({ message: 'Failed to create dev token' });
    }
});

const { getCacheStats } = require('../services/cacheService');

// Metrics endpoint for infrastructure monitoring
router.get('/metrics', (req, res) => {
    try {
        const cacheStats = getCacheStats();
        res.json({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cache: cacheStats
        });
    } catch (_err) {
        res.status(500).json({ message: 'Failed to fetch metrics' });
    }
});

module.exports = router;
