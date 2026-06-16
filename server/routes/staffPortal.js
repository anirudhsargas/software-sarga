const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

module.exports = (upload) => {

    // Get attendance summary for logged-in staff
    router.get('/staff-portal/attendance', authenticateToken, async (req, res) => {
        try {
            // Note: Actual attendance tracking might use a different table in the future.
            // For now, we mock or compute it based on logins or leave records.
            // Placeholder response
            res.json({
                present_days: 20,
                leave_days: 2,
                late_days: 1,
                working_hours: 160
            });
        } catch (err) {
            console.error('Error fetching attendance:', err);
            res.status(500).json({ message: 'Failed to load attendance' });
        }
    });

    // Get leaves
    router.get('/staff-portal/leaves', authenticateToken, async (req, res) => {
        try {
            const [leaves] = await pool.query(
                `SELECT * FROM sarga_staff_leaves WHERE user_id_internal = ? ORDER BY created_at DESC`,
                [req.user.id]
            );
            res.json(leaves);
        } catch (err) {
            console.error('Error fetching leaves:', err);
            res.status(500).json({ message: 'Failed to load leaves' });
        }
    });

    // Request new leave
    router.post('/staff-portal/leaves', authenticateToken, upload.single('attachment'), async (req, res) => {
        const { leave_type, start_date, end_date, reason } = req.body;
        const attachment_url = req.file ? req.file.path : null; // Can use base64 if needed, keeping simple here

        if (!leave_type || !start_date || !end_date || !reason) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        try {
            // Check for overlaps
            const [overlaps] = await pool.query(
                `SELECT id FROM sarga_staff_leaves 
                 WHERE user_id_internal = ? AND status != 'Cancelled' AND status != 'Rejected'
                 AND ((start_date <= ? AND end_date >= ?) OR (start_date <= ? AND end_date >= ?))`,
                [req.user.id, end_date, start_date, end_date, start_date]
            );

            if (overlaps.length > 0) {
                return res.status(400).json({ message: 'Leave dates overlap with an existing request' });
            }

            await pool.query(
                `INSERT INTO sarga_staff_leaves (user_id_internal, leave_type, start_date, end_date, reason, attachment_url) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.id, leave_type, start_date, end_date, reason, attachment_url]
            );

            res.json({ message: 'Leave request submitted successfully' });
        } catch (err) {
            console.error('Error submitting leave:', err);
            res.status(500).json({ message: 'Failed to submit leave' });
        }
    });

    // Cancel leave request
    router.put('/staff-portal/leaves/:id/cancel', authenticateToken, async (req, res) => {
        try {
            const [result] = await pool.query(
                `UPDATE sarga_staff_leaves SET status = 'Cancelled' WHERE id = ? AND user_id_internal = ? AND status = 'Pending'`,
                [req.params.id, req.user.id]
            );
            if (result.affectedRows === 0) {
                return res.status(400).json({ message: 'Cannot cancel this leave request' });
            }
            res.json({ message: 'Leave request cancelled' });
        } catch (err) {
            console.error('Error cancelling leave:', err);
            res.status(500).json({ message: 'Failed to cancel leave' });
        }
    });

    // Get assigned tasks
    router.get('/staff-portal/tasks', authenticateToken, async (req, res) => {
        try {
            const [tasks] = await pool.query(
                `SELECT t.*, s.name as assigned_by_name 
                 FROM sarga_tasks t
                 LEFT JOIN sarga_staff s ON t.assigned_by = s.id
                 WHERE t.assigned_to = ? ORDER BY t.due_date ASC`,
                [req.user.id]
            );
            res.json(tasks);
        } catch (err) {
            console.error('Error fetching tasks:', err);
            res.status(500).json({ message: 'Failed to load tasks' });
        }
    });

    // Get timeline (audit logs specific to the user)
    router.get('/staff-portal/timeline', authenticateToken, async (req, res) => {
        try {
            const [logs] = await pool.query(
                `SELECT action, details, timestamp 
                 FROM sarga_audit_logs 
                 WHERE user_id_internal = ? 
                 ORDER BY timestamp DESC LIMIT 20`,
                [req.user.id]
            );
            res.json(logs);
        } catch (err) {
            console.error('Error fetching timeline:', err);
            res.status(500).json({ message: 'Failed to load timeline' });
        }
    });

    return router;
};
