const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, asyncHandler } = require('../helpers');

const REQUEST_QUERY = `
    SELECT sr.*,
           i.name AS item_name, i.sku AS item_sku,
           b_from.name AS from_branch_name,
           b_to.name AS to_branch_name,
           s_created.name AS created_by_name,
           s_resolved.name AS resolved_by_name,
           s_sent.name AS sent_by_name,
           s_received.name AS received_by_name
    FROM sarga_stock_requests sr
    JOIN sarga_inventory i ON sr.inventory_item_id = i.id
    JOIN sarga_branches b_from ON sr.from_branch_id = b_from.id
    JOIN sarga_branches b_to ON sr.to_branch_id = b_to.id
    JOIN sarga_staff s_created ON sr.created_by = s_created.id
    LEFT JOIN sarga_staff s_resolved ON sr.resolved_by = s_resolved.id
    LEFT JOIN sarga_staff s_sent ON sr.sent_by = s_sent.id
    LEFT JOIN sarga_staff s_received ON sr.received_by = s_received.id
`;

// List stock requests — shows all requests involving the user's branch (incoming + outgoing)
router.get('/stock-requests', authenticateToken, asyncHandler(async (req, res) => {
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user.role);
    let rows;

    if (isPrivileged) {
        [rows] = await pool.query(`${REQUEST_QUERY} ORDER BY sr.created_at DESC LIMIT 200`);
    } else {
        const branchId = await getUserBranchId(req.user.id);
        if (!branchId) return res.json([]);
        [rows] = await pool.query(
            `${REQUEST_QUERY} WHERE sr.from_branch_id = ? OR sr.to_branch_id = ? ORDER BY sr.created_at DESC LIMIT 100`,
            [branchId, branchId]
        );
    }

    res.json(rows);
}));

// Create a stock request (requesting branch → source branch)
// from_branch_id = requester's branch; to_branch_id = branch they want stock FROM
router.post('/stock-requests', authenticateToken, asyncHandler(async (req, res) => {
    const { inventory_item_id, to_branch_id, quantity, notes } = req.body;

    if (!inventory_item_id || !to_branch_id || !quantity) {
        return res.status(400).json({ message: 'inventory_item_id, to_branch_id, and quantity are required' });
    }

    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: 'Quantity must be a positive integer' });
    }

    const fromBranchId = await getUserBranchId(req.user.id);
    if (!fromBranchId) {
        return res.status(400).json({ message: 'Your account is not assigned to a branch' });
    }
    if (String(fromBranchId) === String(to_branch_id)) {
        return res.status(400).json({ message: 'Cannot request stock from your own branch' });
    }

    const [items] = await pool.query('SELECT id, name FROM sarga_inventory WHERE id = ?', [inventory_item_id]);
    if (!items.length) return res.status(404).json({ message: 'Inventory item not found' });

    const [branches] = await pool.query('SELECT id, name FROM sarga_branches WHERE id = ?', [to_branch_id]);
    if (!branches.length) return res.status(404).json({ message: 'Source branch not found' });

    // Check source branch has enough stock
    const [branchStock] = await pool.query(
        'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
        [inventory_item_id, to_branch_id]
    );
    const availableStock = branchStock.length ? branchStock[0].quantity : 0;
    if (availableStock < qty) {
        return res.status(400).json({ message: `Not enough stock at ${branches[0].name}. Available: ${availableStock}` });
    }

    const [result] = await pool.query(
        `INSERT INTO sarga_stock_requests (inventory_item_id, from_branch_id, to_branch_id, quantity, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [inventory_item_id, fromBranchId, to_branch_id, qty, notes || null, req.user.id]
    );

    auditLog(req.user.id, 'STOCK_REQUEST_CREATE', `Requested ${qty}x ${items[0].name} from ${branches[0].name}`, {
        entity_type: 'stock_request', entity_id: result.insertId
    });

    res.status(201).json({ id: result.insertId, message: 'Stock request submitted' });
}));

// Approve or Reject a stock request (Admin/Accountant or source branch staff)
router.put('/stock-requests/:id/approve', authenticateToken, asyncHandler(async (req, res) => {
    const { action } = req.body; // 'approve' or 'reject'
    const reqId = parseInt(req.params.id, 10);

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'action must be approve or reject' });
    }

    const [requests] = await pool.query('SELECT * FROM sarga_stock_requests WHERE id = ?', [reqId]);
    if (!requests.length) return res.status(404).json({ message: 'Request not found' });
    const stockReq = requests[0];

    if (stockReq.status !== 'Pending') {
        return res.status(400).json({ message: `Request is already ${stockReq.status}` });
    }

    // Check authorization: must be admin/accountant OR belong to the source branch
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user.role);
    if (!isPrivileged) {
        const userBranch = await getUserBranchId(req.user.id);
        if (String(userBranch) !== String(stockReq.to_branch_id)) {
            return res.status(403).json({ message: 'Only the source branch or admin can approve/reject' });
        }
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    await pool.query(
        `UPDATE sarga_stock_requests SET status = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [newStatus, req.user.id, reqId]
    );

    auditLog(req.user.id, `STOCK_REQUEST_${newStatus.toUpperCase()}`, `Stock request #${reqId} ${newStatus}`, {
        entity_type: 'stock_request', entity_id: reqId
    });
    res.json({ message: `Request ${newStatus.toLowerCase()}` });
}));

// Send stock — deducts from source branch stock (source branch action)
router.put('/stock-requests/:id/send', authenticateToken, asyncHandler(async (req, res) => {
    const reqId = parseInt(req.params.id, 10);

    const [requests] = await pool.query('SELECT * FROM sarga_stock_requests WHERE id = ?', [reqId]);
    if (!requests.length) return res.status(404).json({ message: 'Request not found' });
    const stockReq = requests[0];

    if (stockReq.status !== 'Approved') {
        return res.status(400).json({ message: `Can only send Approved requests. Current: ${stockReq.status}` });
    }

    // Check authorization: must be admin/accountant OR belong to source branch
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user.role);
    if (!isPrivileged) {
        const userBranch = await getUserBranchId(req.user.id);
        if (String(userBranch) !== String(stockReq.to_branch_id)) {
            return res.status(403).json({ message: 'Only the source branch or admin can send stock' });
        }
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        // Deduct from source branch stock
        const [branchStock] = await connection.query(
            'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ? FOR UPDATE',
            [stockReq.inventory_item_id, stockReq.to_branch_id]
        );
        const currentQty = branchStock.length ? branchStock[0].quantity : 0;
        if (currentQty < stockReq.quantity) {
            await connection.rollback();
            return res.status(400).json({ message: `Insufficient stock. Available: ${currentQty}, Requested: ${stockReq.quantity}` });
        }

        await connection.query(
            'UPDATE sarga_branch_stock SET quantity = quantity - ? WHERE inventory_item_id = ? AND branch_id = ?',
            [stockReq.quantity, stockReq.inventory_item_id, stockReq.to_branch_id]
        );

        // Update request status
        await connection.query(
            `UPDATE sarga_stock_requests SET status = 'Sent', sent_by = ?, sent_at = NOW() WHERE id = ?`,
            [req.user.id, reqId]
        );

        await connection.commit();

        const [item] = await pool.query('SELECT name FROM sarga_inventory WHERE id = ?', [stockReq.inventory_item_id]);
        auditLog(req.user.id, 'STOCK_REQUEST_SENT',
            `Sent ${stockReq.quantity}x ${item[0]?.name || '#' + stockReq.inventory_item_id} from branch #${stockReq.to_branch_id} to branch #${stockReq.from_branch_id}`,
            { entity_type: 'stock_request', entity_id: reqId }
        );

        res.json({ message: 'Stock sent. Waiting for receiving branch to confirm.' });
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));

// Receive stock — adds to requesting branch stock (requesting branch action)
router.put('/stock-requests/:id/receive', authenticateToken, asyncHandler(async (req, res) => {
    const reqId = parseInt(req.params.id, 10);

    const [requests] = await pool.query('SELECT * FROM sarga_stock_requests WHERE id = ?', [reqId]);
    if (!requests.length) return res.status(404).json({ message: 'Request not found' });
    const stockReq = requests[0];

    if (stockReq.status !== 'Sent') {
        return res.status(400).json({ message: `Can only receive Sent requests. Current: ${stockReq.status}` });
    }

    // Check authorization: must be admin/accountant OR belong to requesting branch
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user.role);
    if (!isPrivileged) {
        const userBranch = await getUserBranchId(req.user.id);
        if (String(userBranch) !== String(stockReq.from_branch_id)) {
            return res.status(403).json({ message: 'Only the requesting branch or admin can receive' });
        }
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        // Add to requesting branch stock (upsert)
        await connection.query(
            `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [stockReq.inventory_item_id, stockReq.from_branch_id, stockReq.quantity, stockReq.quantity]
        );

        // Update request status
        await connection.query(
            `UPDATE sarga_stock_requests SET status = 'Received', received_by = ?, received_at = NOW() WHERE id = ?`,
            [req.user.id, reqId]
        );

        await connection.commit();

        const [item] = await pool.query('SELECT name FROM sarga_inventory WHERE id = ?', [stockReq.inventory_item_id]);
        auditLog(req.user.id, 'STOCK_REQUEST_RECEIVED',
            `Received ${stockReq.quantity}x ${item[0]?.name || '#' + stockReq.inventory_item_id} at branch #${stockReq.from_branch_id}`,
            { entity_type: 'stock_request', entity_id: reqId }
        );

        res.json({ message: 'Stock received and added to your branch inventory.' });
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}));

// Get branch stock for a specific item (used by branch-availability)
router.get('/branch-stock/:itemId', authenticateToken, asyncHandler(async (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

    const [rows] = await pool.query(
        `SELECT bs.branch_id, bs.quantity, b.name AS branch_name, b.short_name
         FROM sarga_branch_stock bs
         JOIN sarga_branches b ON bs.branch_id = b.id
         WHERE bs.inventory_item_id = ?
         ORDER BY b.name`,
        [itemId]
    );
    res.json(rows);
}));

// Set / update branch stock (Admin only — for initial setup)
router.put('/branch-stock', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
    const { inventory_item_id, branch_id, quantity } = req.body;

    if (!inventory_item_id || !branch_id || quantity === undefined) {
        return res.status(400).json({ message: 'inventory_item_id, branch_id and quantity are required' });
    }

    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 0) {
        return res.status(400).json({ message: 'Quantity must be a non-negative integer' });
    }

    await pool.query(
        `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = ?`,
        [inventory_item_id, branch_id, qty, qty]
    );

    auditLog(req.user.id, 'BRANCH_STOCK_SET', `Set branch #${branch_id} stock for item #${inventory_item_id} to ${qty}`, {
        entity_type: 'branch_stock', entity_id: inventory_item_id
    });
    res.json({ message: 'Branch stock updated' });
}));

module.exports = router;
