const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, addPaperTypeSchema, paperInwardSchema, paperOutwardSchema, _paperAdjustmentSchema, paperTransferSchema } = require('../middleware/validate');

// --- HELPERS ---

/**
 * Update current stock summary and trigger alerts if stock falls below reorder level.
 */
async function updateStockAndCheckAlerts(connection, paper_type_id, branch_id, quantityChange) {
    // 1. Update current_sheets in summary
    await connection.query(`
        INSERT INTO paper_stock_summary (paper_type_id, branch_id, current_sheets)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE current_sheets = current_sheets + ?
    `, [paper_type_id, branch_id, quantityChange, quantityChange]);

    // 2. Check reorder level
    const [[summary]] = await connection.query(`
        SELECT s.current_sheets, s.reorder_level, t.size_name, t.gsm, t.category,
               COALESCE(sb.name, b.name) as branch_name
        FROM paper_stock_summary s
        JOIN paper_types t ON s.paper_type_id = t.id
        LEFT JOIN branches b ON s.branch_id = b.id
        LEFT JOIN sarga_branches sb ON s.branch_id = sb.id
        WHERE s.paper_type_id = ? AND s.branch_id = ?
    `, [paper_type_id, branch_id]);

    if (summary && summary.reorder_level > 0 && summary.current_sheets < summary.reorder_level) {
        const message = `Low stock alert: ${summary.category} ${summary.size_name} ${summary.gsm ? summary.gsm + ' GSM' : ''} at ${summary.branch_name}. Current: ${summary.current_sheets}, Reorder Level: ${summary.reorder_level}`;
        
        // Only insert if not already alerted recently or just use INSERT IGNORE logic
        await connection.query(`
            INSERT INTO sarga_alerts (type, message, reference_id)
            SELECT ?, ?, ? FROM DUAL
            WHERE NOT EXISTS (
                SELECT 1 FROM sarga_alerts 
                WHERE type = 'PAPER_LOW_STOCK' AND reference_id = ? AND is_read = 0 AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
            )
        `, ['PAPER_LOW_STOCK', message, paper_type_id, paper_type_id]);
    }
}

/**
 * Convert units to sheets based on category and unit type.
 */
function convertToSheets(quantity, unit, _category) {
    const q = Number(quantity);
    if (unit === 'Sheets') return q;
    if (unit === 'Reams') return q * 500;
    if (unit === 'Packets') return q * 100;
    return q;
}

// --- ROUTES ---

// 1. GET /types - List all paper types
router.get('/types', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = 'SELECT * FROM paper_types WHERE is_active = 1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (search) {
            query += ' AND (size_name LIKE ? OR brand LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY category, size_name, gsm';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 2. POST /types - Add new paper type
router.post('/types', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(addPaperTypeSchema), async (req, res) => {
    try {
        const { category, size_name, width_mm, height_mm, gsm, brand } = req.body;
        const [result] = await pool.query(`
            INSERT INTO paper_types (category, size_name, width_mm, height_mm, gsm, brand)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [category, size_name, width_mm, height_mm, gsm, brand]);
        res.status(201).json({ id: result.insertId, message: 'Paper type added successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. GET /stock - Get current stock summary
router.get('/stock', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { branch_id, category } = req.query;
        let query = `
            SELECT s.*, t.category, t.size_name, t.width_mm, t.height_mm, t.gsm, t.brand,
                   COALESCE(sb.name, b.name) as branch_name
                FROM paper_stock_summary s
                JOIN paper_types t ON s.paper_type_id = t.id
                LEFT JOIN branches b ON s.branch_id = b.id
                LEFT JOIN sarga_branches sb ON s.branch_id = sb.id
                WHERE 1=1
        `;
        const params = [];

        if (branch_id) {
            query += ' AND s.branch_id = ?';
            params.push(branch_id);
        }
        if (category) {
            query += ' AND t.category = ?';
            params.push(category);
        }

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 4. POST /inward - Record inward movement
router.post('/inward', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(paperInwardSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { paper_type_id, branch_id, quantity, unit, purchase_rate, supplier_name, notes } = req.body;

        // Fetch category for conversion
        const [[paperType]] = await connection.query('SELECT category FROM paper_types WHERE id = ?', [paper_type_id]);
        if (!paperType) throw new Error('Invalid paper type');

        const totalSheets = convertToSheets(quantity, unit, paperType.category);

        // Record movement
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, unit_quantity, rate_per_unit, supplier_name, notes, created_by)
            VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, ?)
        `, [paper_type_id, branch_id, totalSheets, unit, quantity, purchase_rate, supplier_name, notes, req.user.id]);

        // Update summary
        await updateStockAndCheckAlerts(connection, paper_type_id, branch_id, totalSheets);

        await connection.commit();
        res.status(201).json({ message: 'Stock inward recorded successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// 5. POST /outward - Record outward movement (usage)
router.post('/outward', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(paperOutwardSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { paper_type_id, branch_id, quantity, unit, job_id, notes } = req.body;

        // Fetch category for conversion
        const [[paperType]] = await connection.query('SELECT category FROM paper_types WHERE id = ?', [paper_type_id]);
        if (!paperType) throw new Error('Invalid paper type');

        const totalSheets = convertToSheets(quantity, unit, paperType.category);

        // Check stock availability
        const [[summary]] = await connection.query('SELECT current_sheets FROM paper_stock_summary WHERE paper_type_id = ? AND branch_id = ? FOR UPDATE', [paper_type_id, branch_id]);
        const currentStock = summary ? summary.current_sheets : 0;

        if (currentStock < totalSheets) {
            throw new Error(`Insufficient stock. Available: ${currentStock} sheets, Requested: ${totalSheets} sheets.`);
        }

        // Record movement
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, unit_quantity, job_id, notes, created_by)
            VALUES (?, ?, 'OUTWARD', ?, ?, ?, ?, ?, ?)
        `, [paper_type_id, branch_id, totalSheets, unit, quantity, job_id, notes, req.user.id]);

        // Update summary
        await updateStockAndCheckAlerts(connection, paper_type_id, branch_id, -totalSheets);

        // Update job cost if job_id is provided
        if (job_id) {
            // Get last purchase rate for this paper type at this branch (or overall)
            const [[lastInward]] = await connection.query(`
                SELECT rate_per_unit, unit_type FROM paper_stock_movements 
                WHERE paper_type_id = ? AND movement_type = 'INWARD' 
                ORDER BY created_at DESC LIMIT 1
            `, [paper_type_id]);

            if (lastInward) {
                let ratePerSheet = 0;
                if (lastInward.unit_type === 'Reams') ratePerSheet = lastInward.rate_per_unit / 500;
                else if (lastInward.unit_type === 'Packets') ratePerSheet = lastInward.rate_per_unit / 100;
                else ratePerSheet = lastInward.rate_per_unit;

                const paperCost = totalSheets * ratePerSheet;

                await connection.query(`
                    UPDATE sarga_jobs SET 
                    paper_cost = paper_cost + ?,
                    used_sheets = used_sheets + ?
                    WHERE id = ?
                `, [paperCost, totalSheets, job_id]);
                
                // Trigger cost recalculation for the job
                const { calculateAndUpdateJobCost } = require('../helpers/jobCost');
                const [[job]] = await connection.query('SELECT * FROM sarga_jobs WHERE id = ?', [job_id]);
                if (job) {
                    await calculateAndUpdateJobCost(job);
                }
            }
        }

        await connection.commit();
        res.status(201).json({ message: 'Stock outward recorded successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// 6. POST /transfer - Record branch transfer
router.post('/transfer', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(paperTransferSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { paper_type_id, from_branch_id, to_branch_id, quantity, unit, notes } = req.body;

        if (from_branch_id === to_branch_id) throw new Error('Source and destination branches cannot be the same');

        const [[paperType]] = await connection.query('SELECT category FROM paper_types WHERE id = ?', [paper_type_id]);
        if (!paperType) throw new Error('Invalid paper type');

        const totalSheets = convertToSheets(quantity, unit, paperType.category);

        // Check stock availability in from_branch
        const [[summary]] = await connection.query('SELECT current_sheets FROM paper_stock_summary WHERE paper_type_id = ? AND branch_id = ? FOR UPDATE', [paper_type_id, from_branch_id]);
        const currentStock = summary ? summary.current_sheets : 0;

        if (currentStock < totalSheets) {
            throw new Error(`Insufficient stock in source branch. Available: ${currentStock} sheets, Requested: ${totalSheets} sheets.`);
        }

        // Record OUTWARD from source branch
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, unit_quantity, notes, created_by)
            VALUES (?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, ?)
        `, [paper_type_id, from_branch_id, totalSheets, unit, quantity, `Transfer to branch ${to_branch_id}. ${notes || ''}`, req.user.id]);

        // Record INWARD to destination branch
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, unit_quantity, notes, created_by)
            VALUES (?, ?, 'TRANSFER_IN', ?, ?, ?, ?, ?)
        `, [paper_type_id, to_branch_id, totalSheets, unit, quantity, `Transfer from branch ${from_branch_id}. ${notes || ''}`, req.user.id]);

        // Update summaries
        await updateStockAndCheckAlerts(connection, paper_type_id, from_branch_id, -totalSheets);
        await updateStockAndCheckAlerts(connection, paper_type_id, to_branch_id, totalSheets);

        await connection.commit();
        res.status(201).json({ message: 'Stock transfer recorded successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// 7. GET /movements - History of stock movements
router.get('/movements', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { paper_type_id, branch_id, movement_type, limit = 50, offset = 0 } = req.query;
        let query = `
            SELECT m.*, t.size_name, t.gsm, t.category, COALESCE(sb.name, b.name) as branch_name, s.name as staff_name, j.job_number
            FROM paper_stock_movements m
            JOIN paper_types t ON m.paper_type_id = t.id
            LEFT JOIN branches b ON m.branch_id = b.id
            LEFT JOIN sarga_branches sb ON m.branch_id = sb.id
            JOIN sarga_staff s ON m.created_by = s.id
            LEFT JOIN sarga_jobs j ON m.job_id = j.id
            WHERE 1=1
        `;
        const params = [];

        if (paper_type_id) {
            query += ' AND m.paper_type_id = ?';
            params.push(paper_type_id);
        }
        if (branch_id) {
            query += ' AND m.branch_id = ?';
            params.push(branch_id);
        }
        if (movement_type) {
            query += ' AND m.movement_type = ?';
            params.push(movement_type);
        }

        query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 8. GET /alerts - Current low stock alerts
router.get('/alerts', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT a.* FROM sarga_alerts a
            WHERE a.type = 'PAPER_LOW_STOCK' AND a.is_read = 0
            ORDER BY a.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
