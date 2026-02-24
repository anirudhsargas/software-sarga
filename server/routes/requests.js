const router = require('express').Router();
const { pool } = require('../database');

const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { normalizeMobile, auditLog, hasPendingCustomerBalance, asyncHandler } = require('../helpers');

// --- USER ID CHANGE REQUESTS ---

// Request Change
router.post('/requests/id-change', authenticateToken, asyncHandler(async (req, res) => {
    const { new_user_id } = req.body;
    const userId = req.user.id;
    const oldUserId = req.user.user_id;

    await pool.query("INSERT INTO sarga_id_requests (user_id_internal, old_user_id, new_user_id) VALUES (?, ?, ?)",
        [userId, oldUserId, new_user_id]);
    auditLog(userId, 'ID_CHANGE_REQUEST', `Requested change to ${new_user_id}`);
    res.json({ message: 'Request submitted for admin approval' });
}));

// Admin Review Requests
router.get('/requests/id-change', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT r.*, u.name FROM sarga_id_requests r 
                                     JOIN sarga_staff u ON r.user_id_internal = u.id 
                                     WHERE r.status = 'PENDING'`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Approve/Reject ID Change
router.post('/requests/id-change/:id/review', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [requests] = await connection.query("SELECT * FROM sarga_id_requests WHERE id = ?", [requestId]);
        const request = requests[0];

        if (!request) {
            await connection.rollback();
            return res.status(404).json({ message: 'Request not found' });
        }

        if (action === 'APPROVE') {
            await connection.query("UPDATE sarga_staff SET user_id = ? WHERE id = ?", [request.new_user_id, request.user_id_internal]);
            await connection.query("UPDATE sarga_id_requests SET status = 'APPROVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            auditLog(req.user.id, 'ID_CHANGE_APPROVE', `Approved ID change for user ${request.user_id_internal} to ${request.new_user_id}`);
            await connection.commit();
            res.json({ message: 'Request approved and ID updated' });
        } else {
            await connection.query("UPDATE sarga_id_requests SET status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            auditLog(req.user.id, 'ID_CHANGE_REJECT', `Rejected ID change for user ${request.user_id_internal}`);
            await connection.commit();
            res.json({ message: 'Request rejected' });
        }
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));

// Request customer edit/delete
router.post('/requests/customer-change', authenticateToken, asyncHandler(async (req, res) => {
    const { customer_id, action, payload, note } = req.body;

    if (!customer_id || !action) {
        return res.status(400).json({ message: 'Customer and action are required' });
    }

    if (!['EDIT', 'DELETE'].includes(String(action).toUpperCase())) {
        return res.status(400).json({ message: 'Invalid action' });
    }

    const [rows] = await pool.query("SELECT id FROM sarga_customers WHERE id = ?", [customer_id]);
    if (!rows[0]) return res.status(404).json({ message: 'Customer not found' });

    if (String(action).toUpperCase() === 'DELETE' && req.user.role !== 'Admin') {
        const hasPending = await hasPendingCustomerBalance(customer_id);
        if (hasPending) {
            return res.status(400).json({ message: 'Customer has pending balance and cannot be deleted' });
        }
    }

    await pool.query(
        "INSERT INTO sarga_customer_requests (requester_id, customer_id, action, payload, note) VALUES (?, ?, ?, ?, ?)",
        [req.user.id, customer_id, String(action).toUpperCase(), payload ? JSON.stringify(payload) : null, note || null]
    );
    auditLog(req.user.id, 'CUSTOMER_REQUEST', `Requested ${action} for customer ${customer_id}`);
    res.json({ message: 'Request submitted for admin approval' });
}));

// List customer change requests (Admin)
router.get('/requests/customer-change', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
        SELECT r.*, s.name AS requester_name, c.name AS customer_name
        FROM sarga_customer_requests r
        JOIN sarga_staff s ON r.requester_id = s.id
        JOIN sarga_customers c ON r.customer_id = c.id
        WHERE r.status = 'PENDING'
        ORDER BY r.created_at DESC
    `);
    res.json(rows);
}));

// Approve/Reject customer change requests (Admin)
router.post('/requests/customer-change/:id/review', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [requests] = await connection.query("SELECT * FROM sarga_customer_requests WHERE id = ?", [requestId]);
        const request = requests[0];
        if (!request) {
            await connection.rollback();
            return res.status(404).json({ message: 'Request not found' });
        }

        if (action === 'APPROVE') {
            if (request.action === 'DELETE') {
                await connection.query("DELETE FROM sarga_customers WHERE id = ?", [request.customer_id]);
                auditLog(req.user.id, 'CUSTOMER_DELETE_APPROVE', `Approved delete for customer ${request.customer_id}`);
            }

            if (request.action === 'EDIT') {
                const payload = request.payload ? JSON.parse(request.payload) : {};
                const normalizedMobile = payload.mobile ? normalizeMobile(payload.mobile) : null;

                if (normalizedMobile && normalizedMobile.length !== 10) {
                    await connection.rollback();
                    return res.status(400).json({ message: 'Mobile number must be 10 digits' });
                }

                await connection.query(
                    "UPDATE sarga_customers SET mobile = COALESCE(?, mobile), name = COALESCE(?, name), type = COALESCE(?, type), email = COALESCE(?, email), gst = COALESCE(?, gst), address = COALESCE(?, address) WHERE id = ?",
                    [
                        normalizedMobile,
                        payload.name || null,
                        payload.type || null,
                        payload.email || null,
                        payload.gst || null,
                        payload.address || null,
                        request.customer_id
                    ]
                );
                auditLog(req.user.id, 'CUSTOMER_EDIT_APPROVE', `Approved edit for customer ${request.customer_id}`);
            }

            await connection.query("UPDATE sarga_customer_requests SET status = 'APPROVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
            await connection.commit();
            return res.json({ message: 'Request approved' });
        }

        await connection.query("UPDATE sarga_customer_requests SET status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
        await connection.commit();
        res.json({ message: 'Request rejected' });
    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Mobile number already exists' });
        throw err;
    } finally {
        connection.release();
    }
}));


module.exports = router;
