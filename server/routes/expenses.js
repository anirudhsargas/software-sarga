const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { _getUserBranchId, auditLog, getTodayDate } = require('../helpers');
const { paginate } = require('../helpers/pagination');
const { analyticsCache } = require('../middleware/cache');

// ═══════════════════════════════════════════════════════════════════════
//  EXPENSE DASHBOARD — Aggregated stats
// ═══════════════════════════════════════════════════════════════════════
router.get('/expense-dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), analyticsCache(), async (req, res) => {
    try {
        const { month } = req.query; // YYYY-MM
        let branchIds = null;
        if (!['Admin', 'Accountant'].includes(req.user.role)) {
            branchIds = [req.user.branch_id];
        } else if (req.query.branch_id) {
            branchIds = req.query.branch_id.split(',').map(Number).filter(Boolean);
            if (branchIds.length === 0) branchIds = null;
        }
        const bw = branchIds ? ' AND p.branch_id IN (?)' : '';
        const bp = branchIds ? [branchIds] : [];
        const jbw = branchIds ? ' AND j.branch_id IN (?)' : '';

        const m = month || getTodayDate().slice(0, 7);
        const [yr, mn] = m.split('-').map(Number);
        if (!yr || !mn) {
            return res.json({ success: true, empty: true });
        }
        
        const lastDay = new Date(yr, mn, 0).getDate();
        const startDate = `${m}-01`;
        const endDate = `${m}-${String(lastDay).padStart(2, '0')}`;

        // 1. Total expenses this month
        const [expRows] = await pool.query(
            `SELECT COALESCE(SUM(p.amount), 0) as total FROM sarga_payments p WHERE p.payment_date >= ? AND p.payment_date <= ? ${bw}`,
            [startDate, endDate, ...bp]
        );
        const expenseTotal = Number(expRows[0]?.total || 0);

        // 2. Total income this month (from jobs advance_paid or payments collected)
        const [incRows] = await pool.query(
            `SELECT COALESCE(SUM(j.advance_paid), 0) as collected FROM sarga_jobs j WHERE j.created_at >= ? AND j.created_at <= ? ${jbw}`,
            [startDate, endDate, ...bp]
        );
        const incomeTotal = Number(incRows[0]?.collected || 0);

        const [paymentCountRows] = await pool.query(`SELECT COUNT(*) as cnt FROM sarga_payments p WHERE p.payment_date >= ? AND p.payment_date <= ? ${bw}`, [startDate, endDate, ...bp]);
        const paymentCount = Number(paymentCountRows[0]?.cnt || 0);
        
        const [jobCountRows] = await pool.query(`SELECT COUNT(*) as cnt FROM sarga_jobs j WHERE j.created_at >= ? AND j.created_at <= ? ${jbw}`, [startDate, endDate, ...bp]);
        const jobCount = Number(jobCountRows[0]?.cnt || 0);

        if (paymentCount === 0 && jobCount === 0 && expenseTotal === 0 && incomeTotal === 0) {
            return res.json({ success: true, empty: true });
        }

        // Charts (Daily cashflow for the month)
        const [dailyExp] = await pool.query(
            `SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') as date, SUM(amount) as amount FROM sarga_payments p WHERE payment_date >= ? AND payment_date <= ? ${bw} GROUP BY date`,
            [startDate, endDate, ...bp]
        );
        const [dailyInc] = await pool.query(
            `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, SUM(advance_paid) as amount FROM sarga_jobs j WHERE created_at >= ? AND created_at <= ? ${jbw} GROUP BY date`,
            [startDate, endDate, ...bp]
        );
        
        const chartsMap = {};
        for(let d=1; d<=lastDay; d++) {
            const dateStr = `${m}-${String(d).padStart(2,'0')}`;
            chartsMap[dateStr] = { date: dateStr, income: 0, expense: 0, profit: 0 };
        }
        dailyExp.forEach(r => { if(chartsMap[r.date]) chartsMap[r.date].expense = Number(r.amount); });
        dailyInc.forEach(r => { if(chartsMap[r.date]) chartsMap[r.date].income = Number(r.amount); });
        
        const charts = Object.values(chartsMap).map(c => {
            c.profit = c.income - c.expense;
            return c;
        });

        // Recent Transactions
        const [recentTransactions] = await pool.query(
            `SELECT p.id, p.payment_date as date, p.payee_name as party, p.type, p.description as reference, p.amount 
             FROM sarga_payments p 
             WHERE 1=1 ${bw}
             ORDER BY p.payment_date DESC LIMIT 50`,
             bp
        );

        // Pending Approvals (from vendor_requests)
        const [pendingApprovals] = await pool.query(
            `SELECT id, request_type as type, name as party, status, created_at as date 
             FROM sarga_vendor_requests 
             WHERE status = 'Pending' 
             ORDER BY created_at DESC LIMIT 10`
        );
        
        // Bills Queue (Pending vendor bills)
        const vbw = branchIds ? ' AND vb.branch_id IN (?)' : '';
        const [pendingBills] = await pool.query(
            `SELECT vb.id, v.name as vendor_name, vb.bill_date as date, vb.total_amount as amount, vb.status 
             FROM sarga_vendor_bills vb
             LEFT JOIN sarga_vendors v ON v.id = vb.vendor_id
             WHERE vb.status = 'Pending' ${vbw}
             ORDER BY vb.bill_date ASC LIMIT 50`,
             bp
        );

        res.json({
            success: true,
            month: m,
            summary: {
                income: incomeTotal,
                expense: expenseTotal,
                profit: incomeTotal - expenseTotal
            },
            charts: charts,
            pendingApprovals: pendingApprovals.map(p => ({...p, amount: 0})),
            recentTransactions: recentTransactions.map(t => ({...t, amount: Number(t.amount)})),
            pendingBills: pendingBills.map(b => ({...b, amount: Number(b.amount)}))
        });
    } catch (err) {
        console.error('Expense dashboard error:', err);
        res.json({ success: true, empty: true });
    }
});


// ═══════════════════════════════════════════════════════════════════════
//  RENT LOCATIONS — CRUD
// ═══════════════════════════════════════════════════════════════════════
router.get('/rent-locations', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const branchId = !['Admin', 'Accountant'].includes(req.user.role)
            ? req.user.branch_id
            : req.query.branch_id || null;

        let query = 'SELECT id, property_name, location, owner_name, owner_mobile, monthly_rent, due_day, advance_deposit, branch_id FROM sarga_rent_locations WHERE is_active = 1';
        const params = [];

        if (branchId) {
            query += ' AND branch_id = ?';
            params.push(branchId);
        }

        query += ' ORDER BY property_name';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

router.post('/rent-locations', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { property_name, location, owner_name, owner_mobile, monthly_rent, due_day, advance_deposit, branch_id } = req.body;
    if (!property_name) return res.status(400).json({ message: 'Property name is required' });
    try {
        const [result] = await pool.query(
            `INSERT INTO sarga_rent_locations (property_name, location, owner_name, owner_mobile, monthly_rent, due_day, advance_deposit, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [property_name, location, owner_name, owner_mobile, monthly_rent || 0, due_day || 1, advance_deposit || 0, branch_id || null]
        );
        auditLog(req.user.id, 'RENT_LOCATION_ADD', `Added rent location: ${property_name}`);
        res.status(201).json({ id: result.insertId, message: 'Rent location added' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/rent-locations/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    const { property_name, location, owner_name, owner_mobile, monthly_rent, due_day, advance_deposit, branch_id } = req.body;
    try {
        await pool.query(
            `UPDATE sarga_rent_locations SET property_name=?, location=?, owner_name=?, owner_mobile=?, monthly_rent=?, due_day=?, advance_deposit=?, branch_id=? WHERE id=?`,
            [property_name, location, owner_name, owner_mobile, monthly_rent || 0, due_day || 1, advance_deposit || 0, branch_id || null, req.params.id]
        );
        res.json({ message: 'Rent location updated' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

router.delete('/rent-locations/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        await pool.query('UPDATE sarga_rent_locations SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Rent location removed' });
    } catch (_err) {
        res.status(500).json({ message: 'Database error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  QUICK EXPENSE ENTRY — universal expense form
// ═══════════════════════════════════════════════════════════════════════
const expenseSubCategories = {
    'Vendor': [],
    'Utility': ['Electricity', 'Internet / Broadband', 'Phone', 'Water'],
    'Rent': [],
    'Office & Admin': ['Stationery', 'Printer Paper', 'Toner', 'Office Cleaning', 'Tea / Water / Snacks', 'Furniture', 'Computer Repair', 'UPS / Inverter'],
    'Transport & Delivery': ['Courier Charges', 'Auto / Taxi', 'Fuel', 'Goods Transport', 'Customer Delivery'],
    'Marketing & Sales': ['Flex Printing', 'Google / Facebook Ads', 'Visiting Card Promo', 'Banner / Board', 'Festival Offers', 'Sponsorships'],
    'Machine & Maintenance': ['Minor Repair', 'Oil / Grease', 'Technician', 'AMC Payment', 'Cleaning Materials'],
    'Bank & Finance': ['Bank Charges', 'Loan EMI', 'Interest Paid', 'GST Payment', 'TDS', 'Professional Tax', 'ROC / CA Fees'],
    'Miscellaneous': ['Petty Cash', 'Tips', 'Donations', 'Small Tools', 'Emergency Purchases']
};

router.get('/expense-categories', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), (req, res) => {
    res.json(expenseSubCategories);
});

// ═══════════════════════════════════════════════════════════════════════
//  VENDOR/UTILITY REQUESTS — Front Office can request new vendors/utilities
// ═══════════════════════════════════════════════════════════════════════

// Get all requests (Admin/Accountant see all, Front Office sees only their own)
router.get('/vendor-requests', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { status } = req.query; // 'Pending', 'Approved', 'Rejected', or undefined (all)
        const isAdmin = ['Admin', 'Accountant'].includes(req.user.role);
        const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

        let whereClauses = [];
        const params = [];

        if (!isAdmin) {
            whereClauses.push('vr.requested_by = ?');
            params.push(req.user.id);
        }

        if (status) {
            whereClauses.push('vr.status = ?');
            params.push(status);
        }

        const whereSection = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

        const baseFrom = `
            FROM sarga_vendor_requests vr
            LEFT JOIN sarga_staff req ON req.id = vr.requested_by
            LEFT JOIN sarga_staff rev ON rev.id = vr.reviewed_by
            LEFT JOIN sarga_branches b ON b.id = vr.branch_id
            ${whereSection}`;

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
        const [rows] = await pool.query(`
            SELECT vr.id, vr.request_type, vr.name, vr.contact_person, vr.phone, vr.address, vr.gstin, vr.branch_id, vr.requested_by, vr.status, vr.request_reason, vr.rejection_reason, vr.created_at,
                   req.name as requested_by_name, req.role as requester_role,
                   rev.name as reviewed_by_name,
                   b.name as branch_name
            ${baseFrom}
            ORDER BY vr.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        res.json(response(rows, total));
    } catch (err) {
        console.error('GET /vendor-requests error:', err);
        res.status(500).json({ error: 'Failed to retrieve vendor requests' });
    }
});

// Create a new vendor/utility request (Front Office, Admin, Accountant)
router.post('/vendor-requests', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { request_type, name, contact_person, phone, address, gstin, branch_id, request_reason } = req.body;

        if (!['Vendor', 'Utility', 'Rent', 'Kuri'].includes(request_type)) {
            return res.status(400).json({ error: 'Invalid request_type. Must be Vendor, Utility, Rent, or Kuri.' });
        }
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }

        const [result] = await pool.query(
            `INSERT INTO sarga_vendor_requests 
            (request_type, name, contact_person, phone, address, gstin, branch_id, requested_by, request_reason, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [request_type, name.trim(), contact_person || null, phone || null, address || null,
                gstin || null, branch_id || null, req.user.id, request_reason || null]
        );

        await auditLog(req.user.id, 'INSERT', `Requested new ${request_type}: ${name} (Request ID: ${result.insertId})`);

        res.json({ id: result.insertId, message: `${request_type} request submitted successfully` });
    } catch (err) {
        console.error('POST /vendor-requests error:', err);
        res.status(500).json({ error: 'Failed to create vendor request' });
    }
});

// Approve/Reject a vendor request (Admin/Accountant only)
router.put('/vendor-requests/:id/review', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body; // 'Approved' or 'Rejected'

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be Approved or Rejected' });
        }

        const [[request]] = await pool.query(
            'SELECT id, status, request_type, name, contact_person, phone, address, gstin, branch_id FROM sarga_vendor_requests WHERE id = ?',
            [id]
        );

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (request.status !== 'Pending') {
            return res.status(400).json({ error: 'Request has already been reviewed' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Update request status
            await connection.query(
                `UPDATE sarga_vendor_requests 
                 SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
                 WHERE id = ?`,
                [status, req.user.id, rejection_reason || null, id]
            );

            // If approved, create the actual vendor/utility; rent/kuri requests are informational
            if (status === 'Approved') {
                if (['Vendor', 'Utility'].includes(request.request_type)) {
                    const [vendorResult] = await connection.query(
                        `INSERT INTO vendors 
                        (name, type, contact_person, phone, address, gstin, branch_id, category) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [request.name, request.request_type, request.contact_person, request.phone,
                        request.address, request.gstin, request.branch_id, 'other']
                    );

                    try {
                        await connection.query(
                            `INSERT IGNORE INTO sarga_vendors
                            (name, type, contact_person, phone, address, gstin, branch_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [request.name, request.request_type, request.contact_person, request.phone,
                            request.address, request.gstin, request.branch_id]
                        );
                    } catch (_ignored) { /* ignored */ }

                    await auditLog(req.user.id, 'INSERT', `Approved vendor request #${id} and created ${request.request_type}: ${request.name} (Vendor ID: ${vendorResult.insertId})`);
                } else {
                    await auditLog(req.user.id, 'UPDATE', `Approved ${request.request_type} request #${id}: ${request.name}`);
                }
            } else {
                await auditLog(req.user.id, 'UPDATE', `Rejected ${request.request_type} request #${id}: ${request.name}`);
            }

            await connection.commit();
            res.json({ message: `Request ${status.toLowerCase()} successfully` });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('PUT /vendor-requests/:id/review error:', err);
        res.status(500).json({ error: 'Failed to review vendor request' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  PAYMENT SUGGESTIONS — Track payment frequency, suggest adding as vendor
// ═══════════════════════════════════════════════════════════════════════

// Get payment suggestions (Admin/Accountant only)
router.get('/payment-suggestions', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { min_occurrences = 3 } = req.query;

        const [suggestions] = await pool.query(
            `SELECT id, payee_name, payment_category, occurrence_count, total_amount_paid, last_payment_date FROM sarga_payment_suggestions 
             WHERE occurrence_count >= ? 
               AND suggested_as_vendor = 0 
               AND suggestion_dismissed = 0
             ORDER BY occurrence_count DESC, total_amount_paid DESC
             LIMIT 50`,
            [min_occurrences]
        );

        res.json(suggestions);
    } catch (err) {
        console.error('GET /payment-suggestions error:', err);
        res.status(500).json({ error: 'Failed to retrieve payment suggestions' });
    }
});

// Mark suggestion as converted to vendor (Admin/Accountant only)
router.put('/payment-suggestions/:id/convert', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            'UPDATE sarga_payment_suggestions SET suggested_as_vendor = 1 WHERE id = ?',
            [id]
        );

        res.json({ message: 'Suggestion marked as converted' });
    } catch (err) {
        console.error('PUT /payment-suggestions/:id/convert error:', err);
        res.status(500).json({ error: 'Failed to update suggestion' });
    }
});

// Dismiss a suggestion (Admin/Accountant only)
router.put('/payment-suggestions/:id/dismiss', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            'UPDATE sarga_payment_suggestions SET suggestion_dismissed = 1 WHERE id = ?',
            [id]
        );

        res.json({ message: 'Suggestion dismissed' });
    } catch (err) {
        console.error('PUT /payment-suggestions/:id/dismiss error:', err);
        res.status(500).json({ error: 'Failed to dismiss suggestion' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  TRACK "OTHER" PAYMENTS FREQUENCY (called automatically on payment create)
// ═══════════════════════════════════════════════════════════════════════
async function trackPaymentFrequency(payeeName, category, amount) {
    if (!payeeName || payeeName.trim() === '') return;

    try {
        // Insert or update payment suggestion tracking
        await pool.query(
            `INSERT INTO sarga_payment_suggestions 
            (payee_name, payment_category, occurrence_count, total_amount_paid, last_payment_date) 
            VALUES (?, ?, 1, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                occurrence_count = occurrence_count + 1,
                total_amount_paid = total_amount_paid + ?,
                last_payment_date = NOW()`,
            [payeeName.trim(), category || 'Other', amount, amount]
        );
    } catch (err) {
        console.error('trackPaymentFrequency error:', err);
        // Don't throw - this is a background tracking feature
    }
}

// GET /api/expense-vendors - Get all expense vendors (unified from vendors table)
router.get('/expense-vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, type, contact_person, phone, address, gstin, branch_id, order_link, created_at
             FROM vendors WHERE is_active = TRUE ORDER BY name`
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /expense-vendors error:', err);
        res.status(500).json({ error: 'Failed to fetch expense vendors' });
    }
});

// POST /api/expense-vendors - Create an expense vendor (unified in vendors table)
router.post('/expense-vendors', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
    try {
        const { name, type, contact_person, phone, address, gstin, order_link, branch_id } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const [result] = await pool.query(
            `INSERT INTO vendors 
             (name, type, contact_person, phone, address, gstin, order_link, branch_id, category) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                type || 'Vendor',
                contact_person || null,
                phone || null,
                address || null,
                gstin || null,
                order_link || null,
                branch_id || null,
                'other'
            ]
        );

        try {
            await pool.query(
                `INSERT IGNORE INTO sarga_vendors 
                 (name, type, contact_person, phone, address, gstin, order_link, branch_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, type || 'Vendor', contact_person || null, phone || null,
                 address || null, gstin || null, order_link || null, branch_id || null]
            );
        } catch (_ignored) { /* ignored */ }

        res.status(201).json({ id: result.insertId, name });
    } catch (err) {
        console.error('POST /expense-vendors error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'A vendor with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to create expense vendor' });
    }
});

// PUT /api/expense-vendors/:id - Update an expense vendor (unified in vendors table)
router.put('/expense-vendors/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, contact_person, phone, address, gstin, order_link, branch_id } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        await pool.query(
            `UPDATE vendors 
             SET name = ?, type = ?, contact_person = ?, phone = ?, address = ?, gstin = ?, order_link = ?, branch_id = ?
             WHERE id = ? AND is_active = TRUE`,
            [
                name,
                type || 'Vendor',
                contact_person || null,
                phone || null,
                address || null,
                gstin || null,
                order_link || null,
                branch_id || null,
                id
            ]
        );

        try {
            await pool.query(
                `UPDATE sarga_vendors
                 SET name = ?, type = ?, contact_person = ?, phone = ?, address = ?, gstin = ?, order_link = ?, branch_id = ?
                 WHERE id = ?`,
                [name, type || 'Vendor', contact_person || null, phone || null,
                 address || null, gstin || null, order_link || null, branch_id || null, id]
            );
        } catch (_ignored) { /* ignored */ }

        res.json({ message: 'Vendor updated successfully' });
    } catch (err) {
        console.error('PUT /expense-vendors/:id error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'A vendor with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to update expense vendor' });
    }
});

// DELETE /api/expense-vendors/:id - Soft delete expense vendor (unified)
router.delete('/expense-vendors/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE vendors SET is_active = FALSE WHERE id = ?", [id]);
        try {
            await pool.query('DELETE FROM sarga_vendors WHERE id = ?', [id]);
        } catch (_ignored) { /* ignored */ }
        res.json({ message: 'Vendor deleted successfully' });
    } catch (err) {
        console.error('DELETE /expense-vendors/:id error:', err);
        res.status(500).json({ error: 'Failed to delete expense vendor' });
    }
});

// Export the tracking function so it can be used in payment creation routes
router.trackPaymentFrequency = trackPaymentFrequency;

module.exports = router;


