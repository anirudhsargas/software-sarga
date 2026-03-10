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


// List attendance change requests (Admin)
router.get('/requests/attendance', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
        SELECT r.*, s.name AS staff_name
        FROM sarga_attendance_requests r
        JOIN sarga_staff s ON r.staff_id = s.id
        WHERE r.status = 'Pending'
        ORDER BY r.created_at DESC
    `);
    res.json(rows);
}));

// Approve/Reject attendance change requests (Admin)
router.post('/requests/attendance/:id/review', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;

    if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [requests] = await connection.query("SELECT * FROM sarga_attendance_requests WHERE id = ?", [requestId]);
        const request = requests[0];

        if (!request) {
            await connection.rollback();
            return res.status(404).json({ message: 'Request not found' });
        }

        if (action === 'APPROVE') {
            // Update attendance record
            await connection.query(`
                INSERT INTO sarga_staff_attendance 
                (staff_id, attendance_date, status, notes, created_by)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                notes = VALUES(notes)
            `, [
                request.staff_id,
                request.attendance_date,
                request.requested_status,
                request.requested_notes,
                req.user.id
            ]);

            // If time was requested and it's present/half-day, we can also update the time if those columns exist (in_time)
            if (request.requested_time && (request.requested_status === 'Present' || request.requested_status === 'Half Day')) {
                try {
                    await connection.query(
                        "UPDATE sarga_staff_attendance SET in_time = ? WHERE staff_id = ? AND attendance_date = ?",
                        [request.requested_time, request.staff_id, request.attendance_date]
                    );
                } catch (err) {
                    console.log('Skipping in_time update (column might not exist)');
                }
            }

            auditLog(req.user.id, 'ATTENDANCE_CHANGE_APPROVE', `Approved attendance change for staff ${request.staff_id} on ${request.attendance_date}`);
            await connection.query("UPDATE sarga_attendance_requests SET status = 'Approved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);

            await connection.commit();
            return res.json({ message: 'Attendance request approved successfully' });
        } else {
            auditLog(req.user.id, 'ATTENDANCE_CHANGE_REJECT', `Rejected attendance change for staff ${request.staff_id} on ${request.attendance_date}`);
            await connection.query("UPDATE sarga_attendance_requests SET status = 'Rejected', resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);

            await connection.commit();
            return res.json({ message: 'Attendance request rejected' });
        }
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));


// Get Pending Requests Count (Admin)
router.get('/requests/pending-count', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin) {
        // Accountant only sees discount requests they can act on
        const [discountRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_discount_requests WHERE status = 'PENDING' AND approval_level = 'accountant_or_admin'");
        return res.json({ pending_count: discountRows[0].count });
    }
    const [idRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_id_requests WHERE status = 'PENDING'");
    const [customerRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_customer_requests WHERE status = 'PENDING'");
    const [vendorRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_vendor_requests WHERE status = 'Pending'");
    const [openingRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_opening_change_requests WHERE status = 'Pending'");
    const [attendanceRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_attendance_requests WHERE status = 'Pending'");
    const [discountRows] = await pool.query("SELECT COUNT(*) as count FROM sarga_discount_requests WHERE status = 'PENDING'");

    const totalCount = idRows[0].count + customerRows[0].count + vendorRows[0].count + openingRows[0].count + attendanceRows[0].count + discountRows[0].count;
    res.json({ pending_count: totalCount });
}));

// --- DISCOUNT APPROVAL REQUESTS ---

// Submit a discount approval request (any staff)
router.post('/requests/discount', authenticateToken, asyncHandler(async (req, res) => {
    const { discount_percent, total_amount, customer_name, reason } = req.body;
    const pct = Number(discount_percent);
    if (!pct || pct <= 0) {
        return res.status(400).json({ message: 'Discount percent is required and must be > 0' });
    }
    const approval_level = pct <= 10 ? 'accountant_or_admin' : 'admin_only';
    const [result] = await pool.query(
        "INSERT INTO sarga_discount_requests (requester_id, discount_percent, total_amount, customer_name, reason, approval_level) VALUES (?, ?, ?, ?, ?, ?)",
        [req.user.id, pct, total_amount || null, customer_name || null, reason || null, approval_level]
    );
    auditLog(req.user.id, 'DISCOUNT_REQUEST', `Requested ${pct}% discount on ₹${total_amount}`);
    res.json({ id: result.insertId, status: 'PENDING', approval_level, message: 'Discount request submitted for approval' });
}));

// Get current user's most recent discount request (any staff)
router.get('/requests/discount/my', authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM sarga_discount_requests WHERE requester_id = ? ORDER BY created_at DESC LIMIT 1",
        [req.user.id]
    );
    res.json(rows[0] || null);
}));

// List all pending discount requests (Admin sees all; Accountant sees only accountant_or_admin)
router.get('/requests/discount', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'Admin';
    const [rows] = await pool.query(`
        SELECT r.*, s.name AS requester_name
        FROM sarga_discount_requests r
        JOIN sarga_staff s ON r.requester_id = s.id
        WHERE r.status = 'PENDING'
        ${!isAdmin ? "AND r.approval_level = 'accountant_or_admin'" : ''}
        ORDER BY r.created_at DESC
    `);
    res.json(rows);
}));

// Approve/Reject discount request
router.post('/requests/discount/:id/review', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
    const { action } = req.body;
    const requestId = req.params.id;
    const isAdmin = req.user.role === 'Admin';
    if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
    }
    const [requests] = await pool.query("SELECT * FROM sarga_discount_requests WHERE id = ?", [requestId]);
    if (!requests[0]) return res.status(404).json({ message: 'Request not found' });

    // Accountant can only act on accountant_or_admin level requests
    if (!isAdmin && requests[0].approval_level !== 'accountant_or_admin') {
        return res.status(403).json({ message: 'Only Admin can approve discounts greater than 10%' });
    }

    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await pool.query(
        "UPDATE sarga_discount_requests SET status = ?, reviewed_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, req.user.id, requestId]
    );
    auditLog(req.user.id, `DISCOUNT_${status}`, `${status} discount request ${requestId} (${requests[0].discount_percent}% on ₹${requests[0].total_amount} for ${requests[0].customer_name})`, {
        entity_type: 'discount_request',
        entity_id: Number(requestId),
        field_name: 'status',
        old_value: requests[0].status,
        new_value: status,
        ip_address: req.ip,
    });
    res.json({ message: `Request ${status.toLowerCase()}` });
}));

module.exports = router;

