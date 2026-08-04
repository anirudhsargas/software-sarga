const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validate, addPaperTypeSchema, paperInwardSchema, paperOutwardSchema, paperRateSchema, _paperAdjustmentSchema, paperTransferSchema } = require('../middleware/validate');

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
router.get('/types', authenticateToken, async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `
            SELECT t.*, rh.rate as current_rate, rh.unit_type as current_rate_unit, 
                   rh.effective_date as rate_effective_date, rh.supplier_name as rate_supplier
            FROM paper_types t
            LEFT JOIN paper_rate_history rh ON t.current_rate_id = rh.id
            WHERE t.is_active = 1
        `;
        const params = [];

        if (category) {
            query += ' AND (t.category = ? OR t.category = \'BOTH\')';
            params.push(category);
        }
        if (search) {
            query += ' AND (t.size_name LIKE ? OR t.brand LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY t.category, t.size_name, t.gsm';
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
        const newPaperTypeId = result.insertId;

        // Auto-initialize paper_stock_summary with 0 current_sheets for all active branches
        try {
            const [branches] = await pool.query('SELECT id FROM branches WHERE is_active = 1 UNION SELECT id FROM sarga_branches WHERE is_active = 1');
            if (branches.length > 0) {
                const values = branches.map(b => [newPaperTypeId, b.id, 0, 0]);
                await pool.query('INSERT IGNORE INTO paper_stock_summary (paper_type_id, branch_id, current_sheets, reorder_level) VALUES ?', [values]);
            }
        } catch (initErr) {
            console.error('Failed to auto-init paper_stock_summary for branches:', initErr);
        }

        res.status(201).json({ id: newPaperTypeId, message: 'Paper type added successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 3. GET /stock - Get current stock summary
router.get('/stock', authenticateToken, async (req, res) => {
    try {
        const { branch_id, category, search } = req.query;
        let query = `
            SELECT 
                t.id as paper_type_id,
                COALESCE(s.branch_id, ?) as branch_id,
                COALESCE(s.current_sheets, 0) as current_sheets,
                COALESCE(s.reorder_level, 0) as reorder_level,
                t.category, t.size_name, t.width_mm, t.height_mm, t.gsm, t.brand,
                t.current_rate_id, rh.rate as current_rate, rh.unit_type as current_rate_unit,
                COALESCE(sb.name, b.name, 'Main Branch') as branch_name
            FROM paper_types t
            LEFT JOIN paper_stock_summary s ON s.paper_type_id = t.id ${branch_id ? 'AND s.branch_id = ?' : ''}
            LEFT JOIN paper_rate_history rh ON t.current_rate_id = rh.id
            LEFT JOIN branches b ON s.branch_id = b.id
            LEFT JOIN sarga_branches sb ON s.branch_id = sb.id
            WHERE t.is_active = 1
        `;
        const params = [branch_id || 1];
        if (branch_id) params.push(branch_id);

        if (category) {
            query += ' AND (t.category = ? OR t.category = \'BOTH\')';
            params.push(category);
        }
        if (search) {
            query += ' AND (t.size_name LIKE ? OR t.brand LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY t.category, t.size_name, t.gsm';

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
        const { paper_type_id, branch_id, quantity, unit, purchase_rate, supplier_name, effective_date, notes } = req.body;

        // Fetch paper type info
        const [[paperType]] = await connection.query('SELECT category, current_rate_id FROM paper_types WHERE id = ? FOR UPDATE', [paper_type_id]);
        if (!paperType) throw new Error('Invalid paper type');

        const totalSheets = convertToSheets(quantity, unit, paperType.category);

        // Record movement
        await connection.query(`
            INSERT INTO paper_stock_movements (paper_type_id, branch_id, movement_type, quantity_sheets, unit_type, unit_quantity, rate_per_unit, supplier_name, notes, created_by)
            VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, ?)
        `, [paper_type_id, branch_id, totalSheets, unit, quantity, purchase_rate, supplier_name, notes, req.user.id]);

        // Create rate history record if rate is provided and differs from current
        if (purchase_rate > 0) {
            const [[currentRateRec]] = await connection.query(
                'SELECT rate FROM paper_rate_history WHERE id = ?', [paperType.current_rate_id]
            );
            const currentRate = currentRateRec ? Number(currentRateRec.rate) : 0;

            if (Math.abs(currentRate - purchase_rate) > 0.01 || !paperType.current_rate_id) {
                const rateDate = effective_date || new Date().toISOString().split('T')[0];
                const [rateResult] = await connection.query(`
                    INSERT INTO paper_rate_history (paper_type_id, rate, effective_date, unit_type, supplier_name, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [paper_type_id, purchase_rate, rateDate, unit, supplier_name, `Inward: ${quantity} ${unit}`, req.user.id]);
                await connection.query('UPDATE paper_types SET current_rate_id = ? WHERE id = ?', [rateResult.insertId, paper_type_id]);
            }
        }

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
            // Get current rate from paper_rate_history via paper_types
            const [[rateRec]] = await connection.query(`
                SELECT rh.rate, rh.unit_type
                FROM paper_types t
                LEFT JOIN paper_rate_history rh ON t.current_rate_id = rh.id
                WHERE t.id = ?
            `, [paper_type_id]);

            if (rateRec && rateRec.rate > 0) {
                let ratePerSheet = 0;
                if (rateRec.unit_type === 'Reams') ratePerSheet = rateRec.rate / 500;
                else if (rateRec.unit_type === 'Packets') ratePerSheet = rateRec.rate / 100;
                else ratePerSheet = rateRec.rate;

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
        const { paper_type_id, branch_id, category, movement_type, limit = 50, offset = 0 } = req.query;
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
        if (category) {
            query += ' AND t.category = ?';
            params.push(category);
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

// 8. GET /types/:id/rates - Rate history for a paper type
router.get('/types/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rates] = await pool.query(`
            SELECT rh.*, s.name as created_by_name
            FROM paper_rate_history rh
            LEFT JOIN sarga_staff s ON rh.created_by = s.id
            WHERE rh.paper_type_id = ?
            ORDER BY rh.effective_date DESC, rh.created_at DESC
        `, [req.params.id]);
        res.json(rates);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 9. POST /types/:id/rates - Add new rate for a paper type
router.post('/types/:id/rates', authenticateToken, authorizeRoles('Admin', 'Accountant'), validate(paperRateSchema), async (req, res) => {
    const { id } = req.params;
    const { rate, effective_date, unit_type, supplier_name, supplier_id, purchase_order_ref, notes } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rateResult] = await connection.query(`
            INSERT INTO paper_rate_history (paper_type_id, rate, effective_date, unit_type, supplier_name, supplier_id, purchase_order_ref, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, rate, effective_date || new Date().toISOString().split('T')[0], unit_type || 'Reams', supplier_name || null, supplier_id || null, purchase_order_ref || null, notes || null, req.user.id]);
        await connection.query('UPDATE paper_types SET current_rate_id = ? WHERE id = ?', [rateResult.insertId, id]);
        await connection.commit();
        res.status(201).json({ id: rateResult.insertId, message: 'Rate added successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message });
    } finally {
        connection.release();
    }
});

// 10. GET /types/:id/current-rate - Get current rate for a paper type
router.get('/types/:id/current-rate', authenticateToken, async (req, res) => {
    try {
        const [[row]] = await pool.query(`
            SELECT t.id, t.size_name, t.gsm, t.category,
                   rh.rate as current_rate, rh.effective_date, rh.unit_type, rh.supplier_name
            FROM paper_types t
            LEFT JOIN paper_rate_history rh ON t.current_rate_id = rh.id
            WHERE t.id = ?
        `, [req.params.id]);
        if (!row) return res.status(404).json({ message: 'Paper type not found' });
        res.json({
            id: row.id,
            size_name: row.size_name,
            gsm: row.gsm,
            category: row.category,
            rate: Number(row.current_rate) || 0,
            effective_date: row.effective_date,
            unit_type: row.unit_type || 'Reams',
            supplier_name: row.supplier_name
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 11. GET /alerts - Current low stock alerts
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

// Test route for stock planning setup
router.get('/stock-test', (req, res) => {
    res.json({ ok: true });
});

module.exports = router;
