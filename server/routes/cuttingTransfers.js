const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, cuttingJobSchema, stockTransferSchema, stockTransferReceiveSchema } = require('../middleware/validate');

const ALLOWED_ROLES = ['Admin', 'Accountant', 'Front Office'];

// Shared stock summary helpers (mirror pattern in paperInventory.js)
async function getStockForUpdate(connection, paper_type_id, branch_id) {
    const [[row]] = await connection.query(
        'SELECT current_sheets FROM paper_stock_summary WHERE paper_type_id = ? AND branch_id = ? FOR UPDATE',
        [paper_type_id, branch_id]
    );
    return row ? Number(row.current_sheets) : 0;
}

async function adjustStock(connection, paper_type_id, branch_id, delta) {
    await connection.query(`
        INSERT INTO paper_stock_summary (paper_type_id, branch_id, current_sheets)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE current_sheets = current_sheets + ?
    `, [paper_type_id, branch_id, delta, delta]);
}

// POST /api/cutting-jobs
router.post('/cutting-jobs', authenticateToken, authorizeRoles(...ALLOWED_ROLES), validate(cuttingJobSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { branch_id, paper_type_id, source_size_id, source_qty_sheets, wastage_qty_sheets, outputs, notes } = req.body;

        // Validate source stock
        const currentStock = await getStockForUpdate(connection, source_size_id, branch_id);
        if (currentStock < source_qty_sheets) {
            await connection.rollback();
            return res.status(400).json({
                message: `Insufficient stock. Available: ${currentStock} sheets, Requested: ${source_qty_sheets} sheets.`
            });
        }

        // Insert cutting job
        const [jobResult] = await connection.query(`
            INSERT INTO cutting_jobs (branch_id, paper_type_id, source_size_id, source_qty_sheets, wastage_qty_sheets, performed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [branch_id, paper_type_id, source_size_id, source_qty_sheets, wastage_qty_sheets, req.user.id, notes || null]);

        const cuttingJobId = jobResult.insertId;

        // Insert outputs and increment stock for each
        const outputEntries = [];
        for (const out of outputs) {
            outputEntries.push([cuttingJobId, out.output_size_id, out.output_qty_sheets]);
        }
        await connection.query(
            'INSERT INTO cutting_job_outputs (cutting_job_id, output_size_id, output_qty_sheets) VALUES ?',
            [outputEntries]
        );

        // Decrement source stock
        await adjustStock(connection, source_size_id, branch_id, -source_qty_sheets);

        // Record source movement (OUTWARD-like)
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, notes, created_by)
            VALUES (?, ?, 'OUTWARD', ?, 'Sheets', ?, ?)
        `, [source_size_id, branch_id, source_qty_sheets, `Cutting job #${cuttingJobId}: source consumed. ${notes || ''}`, req.user.id]);

        // Increment stock and record movement for each output
        for (const out of outputs) {
            await adjustStock(connection, out.output_size_id, branch_id, out.output_qty_sheets);
            await connection.query(`
                INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, notes, created_by)
                VALUES (?, ?, 'INWARD', ?, 'Sheets', ?, ?)
            `, [out.output_size_id, branch_id, out.output_qty_sheets, `Cutting job #${cuttingJobId}: output produced. ${notes || ''}`, req.user.id]);
        }

        // Log wastage if any
        if (Number(wastage_qty_sheets) > 0) {
            await connection.query(`
                INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, notes, created_by)
                VALUES (?, ?, 'WASTE', ?, 'Sheets', ?, ?)
            `, [source_size_id, branch_id, wastage_qty_sheets, `Cutting job #${cuttingJobId}: wastage. ${notes || ''}`, req.user.id]);
        }

        // Compute yield sum for logging
        const totalOutputQty = outputs.reduce((sum, o) => sum + Number(o.output_qty_sheets), 0);
        const yieldCheck = {
            source: source_qty_sheets,
            outputs: totalOutputQty,
            wastage: Number(wastage_qty_sheets),
            accounted: totalOutputQty + Number(wastage_qty_sheets),
            difference: source_qty_sheets - totalOutputQty - Number(wastage_qty_sheets)
        };

        await connection.commit();
        res.status(201).json({
            message: 'Cutting job completed successfully',
            cuttingJobId,
            yield_check: yieldCheck
        });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// POST /api/stock-transfers
router.post('/stock-transfers', authenticateToken, authorizeRoles(...ALLOWED_ROLES), validate(stockTransferSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { from_branch_id, to_branch_id, paper_type_id, size_id, qty_dispatched } = req.body;

        if (from_branch_id === to_branch_id) {
            await connection.rollback();
            return res.status(400).json({ message: 'Source and destination branches must be different' });
        }

        // Validate source stock
        const currentStock = await getStockForUpdate(connection, size_id, from_branch_id);
        if (currentStock < qty_dispatched) {
            await connection.rollback();
            return res.status(400).json({
                message: `Insufficient stock. Available: ${currentStock} sheets, Requested: ${qty_dispatched} sheets.`
            });
        }

        // Insert transfer record
        const [transferResult] = await connection.query(`
            INSERT INTO stock_transfers (from_branch_id, to_branch_id, paper_type_id, size_id, qty_dispatched, dispatched_by, status)
            VALUES (?, ?, ?, ?, ?, ?, 'dispatched')
        `, [from_branch_id, to_branch_id, paper_type_id, size_id, qty_dispatched, req.user.id]);

        // Decrement source branch stock
        await adjustStock(connection, size_id, from_branch_id, -qty_dispatched);

        // Record movement
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, notes, created_by)
            VALUES (?, ?, 'TRANSFER_OUT', ?, 'Sheets', ?, ?)
        `, [size_id, from_branch_id, qty_dispatched, `Stock transfer #${transferResult.insertId} to branch ${to_branch_id}`, req.user.id]);

        await connection.commit();
        res.status(201).json({
            message: 'Stock dispatched successfully',
            transferId: transferResult.insertId,
            status: 'dispatched'
        });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// POST /api/stock-transfers/:id/receive
router.post('/stock-transfers/:id/receive', authenticateToken, authorizeRoles(...ALLOWED_ROLES), validate(stockTransferReceiveSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { qty_received } = req.body;

        // Fetch transfer record with lock
        const [[transfer]] = await connection.query(
            'SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!transfer) {
            await connection.rollback();
            return res.status(404).json({ message: 'Transfer not found' });
        }
        if (transfer.status === 'received') {
            await connection.rollback();
            return res.status(400).json({ message: 'Transfer already received' });
        }

        // Branch isolation: only to_branch users (or admin) can receive
        const userBranchId = Number(req.user.branch_id);
        const userRole = req.user.role;
        const isAdmin = userRole === 'Admin' || userRole === 'Accountant';
        if (!isAdmin && userBranchId !== Number(transfer.to_branch_id)) {
            await connection.rollback();
            return res.status(403).json({ message: 'Only the receiving branch can confirm receipt' });
        }

        // Update transfer record
        await connection.query(`
            UPDATE stock_transfers SET status = 'received', qty_received = ?, received_by = ?, received_at = NOW()
            WHERE id = ?
        `, [qty_received, req.user.id, id]);

        // Increment destination branch stock
        await adjustStock(connection, transfer.size_id, transfer.to_branch_id, qty_received);

        // Record movement
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, notes, created_by)
            VALUES (?, ?, 'TRANSFER_IN', ?, 'Sheets', ?, ?)
        `, [transfer.size_id, transfer.to_branch_id, qty_received, `Stock transfer #${id} received from branch ${transfer.from_branch_id}`, req.user.id]);

        await connection.commit();

        const discrepancy = Number(qty_received) !== Number(transfer.qty_dispatched);
        res.json({
            message: discrepancy
                ? 'Transfer received with quantity discrepancy'
                : 'Transfer received successfully',
            transferId: Number(id),
            qty_dispatched: Number(transfer.qty_dispatched),
            qty_received: Number(qty_received),
            discrepancy
        });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// GET /api/stock-transfers
router.get('/stock-transfers', authenticateToken, authorizeRoles(...ALLOWED_ROLES), async (req, res) => {
    try {
        const { status, branch_id, page = 1, limit = 50 } = req.query;
        let query = `
            SELECT st.*, 
                   fb.name AS from_branch_name, tb.name AS to_branch_name,
                   pt.size_name, pt.gsm, pt.category,
                   ds.name AS dispatched_by_name, rs.name AS received_by_name
            FROM stock_transfers st
            LEFT JOIN sarga_branches fb ON st.from_branch_id = fb.id
            LEFT JOIN sarga_branches tb ON st.to_branch_id = tb.id
            LEFT JOIN paper_types pt ON st.size_id = pt.id
            LEFT JOIN sarga_staff ds ON st.dispatched_by = ds.id
            LEFT JOIN sarga_staff rs ON st.received_by = rs.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND st.status = ?';
            params.push(status);
        }
        if (branch_id) {
            query += ' AND (st.from_branch_id = ? OR st.to_branch_id = ?)';
            params.push(branch_id, branch_id);
        }

        query += ' ORDER BY st.dispatched_at DESC LIMIT ? OFFSET ?';
        const offset = (Number(page) - 1) * Number(limit);
        params.push(Number(limit), offset);

        const [rows] = await pool.query(query, params);

        // Count total
        let countQuery = 'SELECT COUNT(*) AS total FROM stock_transfers st WHERE 1=1';
        const countParams = [];
        if (status) {
            countQuery += ' AND st.status = ?';
            countParams.push(status);
        }
        if (branch_id) {
            countQuery += ' AND (st.from_branch_id = ? OR st.to_branch_id = ?)';
            countParams.push(branch_id, branch_id);
        }
        const [[{ total }]] = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            data: rows,
            total,
            page: Number(page),
            limit: Number(limit)
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
