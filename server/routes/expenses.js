const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog } = require('../helpers');

// ═══════════════════════════════════════════════════════════════════════
//  EXPENSE DASHBOARD — Aggregated stats
// ═══════════════════════════════════════════════════════════════════════
router.get('/expense-dashboard', authenticateToken, async (req, res) => {
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

        // Date range for the month (calculate correct last day)
        const m = month || new Date().toISOString().slice(0, 7);
        const [yr, mn] = m.split('-').map(Number);
        const lastDay = new Date(yr, mn, 0).getDate();
        const startDate = `${m}-01`;
        const endDate = `${m}-${String(lastDay).padStart(2, '0')}`;

        // 1. Total expenses this month by category
        const [catRows] = await pool.query(
            `SELECT p.type as category, SUM(p.amount) as total
             FROM sarga_payments p
             WHERE p.payment_date >= ? AND p.payment_date <= ? ${bw}
             GROUP BY p.type`,
            [startDate, endDate, ...bp]
        );
        const byCategory = {};
        let totalExpenses = 0;
        catRows.forEach(r => {
            byCategory[r.category] = Number(r.total);
            totalExpenses += Number(r.total);
        });

        // 2. Vendor totals: purchases vs payments
        const vbw = branchIds ? ' AND vb.branch_id IN (?)' : '';
        const [[vendorPurchases]] = await pool.query(
            `SELECT COALESCE(SUM(vb.total_amount), 0) as total
             FROM sarga_vendor_bills vb
             WHERE vb.bill_date >= ? AND vb.bill_date <= ? ${vbw}`,
            [startDate, endDate, ...bp]
        );
        const [[vendorPayments]] = await pool.query(
            `SELECT COALESCE(SUM(p.amount), 0) as total
             FROM sarga_payments p
             WHERE p.type = 'Vendor' AND p.payment_date >= ? AND p.payment_date <= ? ${bw}`,
            [startDate, endDate, ...bp]
        );

        // 3. Total payable to vendors (all time purchases - all time payments)
        const [[allTimePurchases]] = await pool.query(
            `SELECT COALESCE(SUM(vb.total_amount), 0) as total FROM sarga_vendor_bills vb ${branchIds ? 'WHERE vb.branch_id IN (?)' : ''}`,
            bp
        );
        const [[allTimeVendorPayments]] = await pool.query(
            `SELECT COALESCE(SUM(p.amount), 0) as total FROM sarga_payments p WHERE p.type = 'Vendor' ${bw}`,
            bp
        );
        const totalVendorPayable = Number(allTimePurchases.total) - Number(allTimeVendorPayments.total);

        // 4. Overdue vendors (total purchases > total payments)
        const [overdueVendors] = await pool.query(
            `SELECT v.id, v.name, v.phone, v.type as vendor_category,
                    COALESCE(pur.total, 0) as total_purchases,
                    COALESCE(pay.total, 0) as total_paid,
                    (COALESCE(pur.total, 0) - COALESCE(pay.total, 0)) as balance
             FROM sarga_vendors v
             LEFT JOIN (
                SELECT vb.vendor_id, SUM(vb.total_amount) as total
                FROM sarga_vendor_bills vb ${branchIds ? 'WHERE vb.branch_id IN (?)' : ''}
                GROUP BY vb.vendor_id
             ) pur ON pur.vendor_id = v.id
             LEFT JOIN (
                SELECT p.vendor_id, SUM(p.amount) as total
                FROM sarga_payments p
                WHERE p.type = 'Vendor' ${bw}
                GROUP BY p.vendor_id
             ) pay ON pay.vendor_id = v.id
             HAVING balance > 0
             ORDER BY balance DESC
             LIMIT 20`,
            [...bp, ...bp]
        );

        // 5. Rent status this month
        const [rentLocations] = await pool.query(
            `SELECT r.*, COALESCE(paid.total, 0) as paid_this_month
             FROM sarga_rent_locations r
             LEFT JOIN (
                SELECT p.description, SUM(p.amount) as total
                FROM sarga_payments p
                WHERE p.type = 'Rent' AND p.payment_date >= ? AND p.payment_date <= ? ${bw}
                GROUP BY p.description
             ) paid ON paid.description = r.property_name
             WHERE r.is_active = 1 ${branchIds ? ' AND r.branch_id IN (?)' : ''}
             ORDER BY r.property_name`,
            [startDate, endDate, ...bp, ...(branchIds ? [branchIds] : [])]
        );

        // 6. Utility summary this month (payments)
        const [utilitySummary] = await pool.query(
            `SELECT p.payee_name, SUM(p.amount) as total
             FROM sarga_payments p
             WHERE p.type = 'Utility' AND p.payment_date >= ? AND p.payment_date <= ? ${bw}
             GROUP BY p.payee_name
             ORDER BY total DESC`,
            [startDate, endDate, ...bp]
        );

        // 6b. Utility bills this month
        const ubw = branchIds ? ' AND ub.branch_id IN (?)' : '';
        const [[utilityBillTotal]] = await pool.query(
            `SELECT COALESCE(SUM(ub.amount), 0) as total
             FROM sarga_utility_bills ub
             WHERE ub.bill_date >= ? AND ub.bill_date <= ? ${ubw}`,
            [startDate, endDate, ...bp]
        );
        const [[allTimeUtilityBills]] = await pool.query(
            `SELECT COALESCE(SUM(ub.amount), 0) as total FROM sarga_utility_bills ub ${branchIds ? 'WHERE ub.branch_id IN (?)' : ''}`, bp
        );
        const [[allTimeUtilityPayments]] = await pool.query(
            `SELECT COALESCE(SUM(p.amount), 0) as total FROM sarga_payments p WHERE p.type = 'Utility' ${bw}`, bp
        );
        const utilityPayable = Number(allTimeUtilityBills.total) - Number(allTimeUtilityPayments.total);

        // 7. Recent payments (last 15)
        const [recentPayments] = await pool.query(
            `SELECT p.id, p.type, p.payee_name, p.amount, p.payment_method, p.payment_date, p.description
             FROM sarga_payments p
             WHERE 1=1 ${bw}
             ORDER BY p.payment_date DESC, p.created_at DESC
             LIMIT 15`,
            bp
        );

        // 8. Jobs revenue this month (for net profit calc)
        const jbw = branchIds ? ' AND j.branch_id IN (?)' : '';
        const [[monthRevenue]] = await pool.query(
            `SELECT COALESCE(SUM(j.advance_paid), 0) as collected
             FROM sarga_jobs j
             WHERE j.created_at >= ? AND j.created_at <= ? ${jbw}`,
            [startDate, endDate, ...(branchIds ? [branchIds] : [])]
        );

        // Highest category
        let highestCategory = '—';
        let highestAmount = 0;
        Object.entries(byCategory).forEach(([k, v]) => {
            if (v > highestAmount) { highestAmount = v; highestCategory = k; }
        });

        // (Response built below after collecting monthly trend & alerts)

        // 10. Monthly trend (last 6 months)
        const [monthlyTrend] = await pool.query(
            `SELECT 
                DATE_FORMAT(p.payment_date, '%Y-%m') as month,
                SUM(p.amount) as total
             FROM sarga_payments p
             WHERE p.payment_date >= DATE_SUB(?, INTERVAL 6 MONTH) ${bw}
             GROUP BY DATE_FORMAT(p.payment_date, '%Y-%m')
             ORDER BY month ASC`,
            [startDate, ...bp]
        );

        // 11. Due alerts
        const today = new Date().toISOString().slice(0, 10);
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Overdue utilities (no payment this month)
        const [overdueUtilities] = await pool.query(
            `SELECT p1.payee_name, MAX(p1.amount) as last_amount
             FROM sarga_payments p1
             WHERE p1.type = 'Utility' 
               AND NOT EXISTS (
                 SELECT 1 FROM sarga_payments p2 
                 WHERE p2.type = 'Utility' 
                   AND p2.payee_name = p1.payee_name
                   AND MONTH(p2.payment_date) = ? 
                   AND YEAR(p2.payment_date) = ?
               )
               ${branchIds ? ' AND p1.branch_id IN (?)' : ''}
             GROUP BY p1.payee_name
             ORDER BY MAX(p1.payment_date) DESC
             LIMIT 10`,
            [currentMonth, currentYear, ...bp]
        );

        // Due EMIs
        const [dueEmis] = await pool.query(
            `SELECT em.id, em.institution_name, em.monthly_emi, em.due_day
             FROM sarga_emi_master em
             WHERE em.is_active = 1 
               AND em.id NOT IN (
                 SELECT emi_id FROM sarga_emi_payments 
                 WHERE MONTH(payment_date) = ? AND YEAR(payment_date) = ?
               )
               ${branchIds ? 'AND em.branch_id IN (?)' : ''}
             ORDER BY em.due_day ASC`,
            [currentMonth, currentYear, ...(branchIds ? [branchIds] : [])]
        );

        // Due Kuris
        const [dueKuris] = await pool.query(
            `SELECT 
                km.id, 
                km.kuri_name, 
                km.monthly_installment,
                km.monthly_installment - COALESCE((
                  SELECT SUM(amount) FROM sarga_kuri_payments 
                  WHERE kuri_id = km.id 
                    AND MONTH(payment_date) = ? 
                    AND YEAR(payment_date) = ?
                ), 0) as remaining
             FROM sarga_kuri_master km
             WHERE km.is_active = 1 
               ${branchIds ? 'AND km.branch_id IN (?)' : ''}
             HAVING remaining > 0
             ORDER BY km.due_day ASC`,
            [currentMonth, currentYear, ...(branchIds ? [branchIds] : [])]
        );

        const responseData = {
            month: m,
            total_expenses: totalExpenses,
            by_category: byCategory,
            highest_category: highestCategory,
            highest_category_amount: highestAmount,
            net_profit: Number(monthRevenue.collected) - totalExpenses,
            revenue_collected: Number(monthRevenue.collected),
            vendor: {
                purchases_this_month: Number(vendorPurchases.total),
                payments_this_month: Number(vendorPayments.total),
                total_payable: Math.max(totalVendorPayable, 0)
            },
            overdue_vendors: overdueVendors.map(v => ({
                ...v,
                total_purchases: Number(v.total_purchases),
                total_paid: Number(v.total_paid),
                balance: Number(v.balance)
            })),
            rent_locations: rentLocations.map(r => ({
                ...r,
                monthly_rent: Number(r.monthly_rent),
                paid_this_month: Number(r.paid_this_month),
                remaining: Math.max(Number(r.monthly_rent) - Number(r.paid_this_month), 0)
            })),
            utility_summary: utilitySummary.map(u => ({
                name: u.payee_name,
                total: Number(u.total)
            })),
            utility: {
                bills_this_month: Number(utilityBillTotal.total),
                payments_this_month: utilitySummary.reduce((s, u) => s + Number(u.total), 0),
                total_payable: Math.max(utilityPayable, 0)
            },
            recent_payments: recentPayments.map(p => ({
                ...p,
                amount: Number(p.amount)
            })),
            monthly_trend: monthlyTrend.map(t => ({
                month: t.month,
                total: Number(t.total)
            })),
            alerts: {
                overdue_utilities: overdueUtilities.map(u => ({
                    name: u.payee_name,
                    last_amount: Number(u.last_amount)
                })),
                due_emis: dueEmis.map(e => ({
                    id: e.id,
                    name: e.institution_name,
                    amount: Number(e.monthly_emi),
                    due_day: e.due_day
                })),
                due_kuris: dueKuris.map(k => ({
                    id: k.id,
                    name: k.kuri_name,
                    remaining: Number(k.remaining)
                }))
            }
        };

        // Add branch expenses for Admin/Accountant
        if (['Admin', 'Accountant'].includes(req.user.role)) {
            const [branchExpenses] = await pool.query(
                `SELECT b.id as branch_id, b.name as branch_name, COALESCE(SUM(p.amount), 0) as total
                 FROM sarga_branches b
                 LEFT JOIN sarga_payments p ON p.branch_id = b.id 
                   AND p.payment_date >= ? AND p.payment_date <= ?
                 GROUP BY b.id, b.name
                 ORDER BY total DESC`,
                [startDate, endDate]
            );

            // Per-branch revenue (jobs)
            const [branchRevenue] = await pool.query(
                `SELECT b.id as branch_id, b.name as branch_name,
                        COUNT(j.id) as job_count,
                        COALESCE(SUM(j.total_amount), 0) as revenue,
                        COALESCE(SUM(j.advance_paid), 0) as collected,
                        COALESCE(SUM(j.balance_amount), 0) as balance
                 FROM sarga_branches b
                 LEFT JOIN sarga_jobs j ON j.branch_id = b.id 
                   AND j.created_at >= ? AND j.created_at <= ?
                   AND j.status != 'Cancelled'
                 GROUP BY b.id, b.name
                 ORDER BY revenue DESC`,
                [startDate, endDate]
            );

            const revenueMap = {};
            branchRevenue.forEach(r => {
                revenueMap[r.branch_id] = {
                    job_count: r.job_count || 0,
                    revenue: Number(r.revenue),
                    collected: Number(r.collected),
                    balance: Number(r.balance)
                };
            });

            responseData.branch_expenses = branchExpenses.map(b => {
                const rev = revenueMap[b.branch_id] || { job_count: 0, revenue: 0, collected: 0, balance: 0 };
                return {
                    branch: b.branch_name,
                    branch_id: b.branch_id,
                    total: Number(b.total),
                    revenue: rev.revenue,
                    collected: rev.collected,
                    balance: rev.balance,
                    job_count: rev.job_count,
                    profit: rev.revenue - Number(b.total)
                };
            });
        }

        res.json(responseData);
    } catch (err) {
        console.error('Expense dashboard error:', err);
        res.status(500).json({ message: 'Failed to load expense dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  RENT LOCATIONS — CRUD
// ═══════════════════════════════════════════════════════════════════════
router.get('/rent-locations', authenticateToken, async (req, res) => {
    try {
        const branchId = !['Admin', 'Accountant'].includes(req.user.role)
            ? req.user.branch_id
            : req.query.branch_id || null;

        let query = 'SELECT * FROM sarga_rent_locations WHERE is_active = 1';
        const params = [];

        if (branchId) {
            query += ' AND branch_id = ?';
            params.push(branchId);
        }

        query += ' ORDER BY property_name';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
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
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
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
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

router.delete('/rent-locations/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        await pool.query('UPDATE sarga_rent_locations SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Rent location removed' });
    } catch (err) {
        res.status(500).json({ message: 'Database error', error: err.message });
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

router.get('/expense-categories', authenticateToken, (req, res) => {
    res.json(expenseSubCategories);
});

// ═══════════════════════════════════════════════════════════════════════
//  VENDOR/UTILITY REQUESTS — Front Office can request new vendors/utilities
// ═══════════════════════════════════════════════════════════════════════

// Get all requests (Admin/Accountant see all, Front Office sees only their own)
router.get('/vendor-requests', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query; // 'Pending', 'Approved', 'Rejected', or undefined (all)
        const isAdmin = ['Admin', 'Accountant'].includes(req.user.role);

        let query = `
            SELECT vr.*, 
                   req.name as requested_by_name, req.role as requester_role,
                   rev.name as reviewed_by_name,
                   b.name as branch_name
            FROM sarga_vendor_requests vr
            LEFT JOIN sarga_staff req ON req.id = vr.requested_by
            LEFT JOIN sarga_staff rev ON rev.id = vr.reviewed_by
            LEFT JOIN sarga_branches b ON b.id = vr.branch_id
        `;
        const params = [];

        if (!isAdmin) {
            query += ' WHERE vr.requested_by = ?';
            params.push(req.user.id);
        }

        if (status) {
            query += (params.length > 0 ? ' AND' : ' WHERE') + ' vr.status = ?';
            params.push(status);
        }

        query += ' ORDER BY vr.created_at DESC';

        const [requests] = await pool.query(query, params);
        res.json(requests);
    } catch (err) {
        console.error('GET /vendor-requests error:', err);
        res.status(500).json({ error: 'Failed to retrieve vendor requests' });
    }
});

// Create a new vendor/utility request (Front Office, Admin, Accountant)
router.post('/vendor-requests', authenticateToken, async (req, res) => {
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
            'SELECT * FROM sarga_vendor_requests WHERE id = ?',
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
                        `INSERT INTO sarga_vendors 
                        (name, type, contact_person, phone, address, gstin, branch_id) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [request.name, request.request_type, request.contact_person, request.phone,
                        request.address, request.gstin, request.branch_id]
                    );

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
            `SELECT * FROM sarga_payment_suggestions 
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

// Export the tracking function so it can be used in payment creation routes
router.trackPaymentFrequency = trackPaymentFrequency;

module.exports = router;


