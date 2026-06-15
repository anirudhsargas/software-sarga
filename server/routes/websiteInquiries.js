const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { paginate } = require('../helpers/pagination');

// Middleware to ensure user is Admin
const requireAdmin = (req, res, next) => {
    if (!['Admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
};

// GET /api/website-inquiries
// Fetch paginated inquiries with optional status filter
router.get('/website-inquiries', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        const { limit, offset, page, response } = paginate(req.query, req.query.page, req.query.limit || 50);

        let whereClause = '';
        let queryParams = [];

        if (status && status !== 'All') {
            whereClause = 'WHERE status = ?';
            queryParams.push(status);
        }

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM sarga_website_inquiries ${whereClause}`,
            queryParams
        );

        const [inquiries] = await pool.query(
            `SELECT * FROM sarga_website_inquiries 
             ${whereClause} 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );

        res.json(response(inquiries, total));
    } catch (err) {
        console.error('Fetch inquiries error:', err);
        res.status(500).json({ message: 'Failed to load inquiries' });
    }
});

// PATCH /api/website-inquiries/:id/status
// Update status and optional internal notes
router.patch('/website-inquiries/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, internal_notes } = req.body;

    if (!status || !['New', 'Contacted', 'Closed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    try {
        // Create internal_notes column if it doesn't exist (migration)
        try {
            await pool.query('ALTER TABLE sarga_website_inquiries ADD COLUMN internal_notes TEXT NULL');
        } catch (e) {
            // Column might already exist, ignore error
        }

        const updates = ['status = ?'];
        const values = [status];

        if (internal_notes !== undefined) {
            updates.push('internal_notes = ?');
            values.push(internal_notes || null);
        }

        values.push(id);

        const [result] = await pool.query(
            `UPDATE sarga_website_inquiries SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Inquiry not found' });
        }

        res.json({ message: 'Inquiry updated successfully', status, internal_notes });
    } catch (err) {
        console.error('Update inquiry error:', err);
        res.status(500).json({ message: 'Failed to update inquiry' });
    }
});

// DELETE /api/website-inquiries/:id
// Delete/archive an inquiry
router.delete('/website-inquiries/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.query('DELETE FROM sarga_website_inquiries WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Inquiry not found' });
        }
        res.json({ message: 'Inquiry deleted successfully' });
    } catch (err) {
        console.error('Delete inquiry error:', err);
        res.status(500).json({ message: 'Failed to delete inquiry' });
    }
});

module.exports = router;


