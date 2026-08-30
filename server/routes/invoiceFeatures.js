// ─── Invoice Email, Recurring, Status Workflow, Expiry/Overdue ─
// Features 2, 4, 5, 6, 8: customer-facing email, recurring billing, status, overdue, payment modes
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const nodemailer = require('nodemailer');


// ──────────────────────────────────────────────────────────────
// FEATURE 2: Email Invoice to Client
// ──────────────────────────────────────────────────────────────
const { sendEmail } = require('../utils/mailer');

router.post('/invoices/:paymentId/send-email', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { email, subject, message } = req.body;

        let [[payment]] = await pool.query(
            `SELECT cp.*, 
                    c.email AS customer_email_db,
                    si.invoice_number
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_customers c ON c.id = cp.customer_id
             LEFT JOIN sarga_invoices si ON si.payment_id = cp.id
             WHERE cp.id = ? OR si.id = ? OR si.invoice_number = ?`, [paymentId, paymentId, paymentId]
        );

        if (!payment) {
            // Fallback lookup from sarga_invoices table
            const [[inv]] = await pool.query(
                `SELECT si.id, si.invoice_number, si.total_amount, si.created_at AS payment_date,
                        si.payment_status AS verification_status, c.name AS customer_name, c.email AS customer_email_db
                 FROM sarga_invoices si
                 LEFT JOIN sarga_customers c ON c.id = si.customer_id
                 WHERE si.id = ? OR si.invoice_number = ?`, [paymentId, paymentId]
            );
            if (inv) payment = inv;
        }

        if (!payment) return res.status(404).json({ message: 'Invoice not found' });

        const targetEmail = (email || payment.customer_email || payment.customer_email_db || payment.email || '').trim();
        if (!targetEmail) return res.status(400).json({ message: 'Email address is required. Please provide a valid email.' });

        // Get company settings for branding
        const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings').catch(() => [[]]);
        const config = {};
        (settings || []).forEach(s => { config[s.setting_key] = s.setting_value; });

        const companyName = config.company_name || 'Sarga Offset';
        const footerText = config.invoice_footer_text || 'Thank you for your business!';

        const formattedDate = payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN');
        const invNum = payment.invoice_number || `INV-${payment.id}`;
        const invAmount = Number(payment.total_amount || payment.net_amount || 0);

        const invoiceSubject = subject || `Invoice #${invNum} from ${companyName}`;
        const invoiceMessage = message || `Dear ${payment.customer_name || 'Customer'},\n\nPlease find your invoice details below.\n\nInvoice #: ${invNum}\nAmount: ₹${invAmount.toLocaleString('en-IN')}\nDate: ${formattedDate}\n\n${footerText}\n\n${companyName}`;

        const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">${companyName}</h1>
                <p style="margin: 4px 0 0; opacity: 0.8;">Invoice #${invNum}</p>
            </div>
            <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                <p>Dear <strong>${payment.customer_name || 'Customer'}</strong>,</p>
                <p>${message || 'Please find your invoice details below.'}</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${invNum}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${formattedDate}</td></tr>
                    <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd;">₹${invAmount.toLocaleString('en-IN')}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.verification_status || payment.payment_status || 'Pending'}</td></tr>
                </table>
                <p style="color: #666; font-size: 13px;">${footerText}</p>
            </div>
            <div style="text-align: center; padding: 12px; background: #f5f5f5; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
                ${companyName} ${config.company_phone ? '| ' + config.company_phone : ''} ${config.company_email ? '| ' + config.company_email : ''}
            </div>
            
            <!-- Thin divider line above the footer -->
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;" />

            <!-- Sarga Printing Premium Footer -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: Arial, sans-serif; color: #333333; line-height: 1.5; font-size: 13px; margin-top: 10px;">
                <tr>
                    <td style="padding-bottom: 15px;">
                        <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td valign="middle" style="padding-right: 12px;">
                                    <img src="https://software-sarga.vercel.app/logo.png" width="48" height="48" alt="Sarga Printing Logo" style="display: block; width: 48px; height: 48px; border: 0; border-radius: 6px;" />
                                </td>
                                <td valign="middle">
                                    <div style="font-size: 16px; font-weight: bold; color: #1a1a1a; letter-spacing: 0.5px; text-transform: uppercase;">SARGA PRINTING</div>
                                    <div style="font-size: 11px; color: #718096; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px;">Printing &bull; Designing &bull; Finishing</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td>
                        <!--[if (gte mso 9)|(IE)]>
                        <table align="center" border="0" cellspacing="0" cellpadding="0" width="560">
                        <tr>
                        <td align="left" valign="top" width="270">
                        <![endif]-->
                        <table align="left" border="0" cellpadding="0" cellspacing="0" width="270" style="width: 100%; max-width: 270px; margin-bottom: 15px;">
                            <tr>
                                <td style="padding-right: 15px;">
                                    <div style="font-weight: bold; font-size: 12px; color: #2d3748; letter-spacing: 0.5px; border-left: 2px solid #4a5568; padding-left: 8px; margin-bottom: 6px;">PERAMBRA</div>
                                    <table border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #4a5568;">
                                        <tr>
                                            <td style="padding-bottom: 4px; padding-left: 8px;">
                                                <span style="margin-right: 4px;">📞</span> 
                                                <a href="tel:9495177284" style="color: #2b6cb0; text-decoration: none; font-weight: 500;">9495177284</a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding-left: 8px;">
                                                <span style="margin-right: 4px;">✉️</span> 
                                                <a href="mailto:sargapba@gmail.com" style="color: #2b6cb0; text-decoration: none;">sargapba@gmail.com</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <!--[if (gte mso 9)|(IE)]>
                        </td>
                        <td align="left" valign="top" width="270">
                        <![endif]-->
                        <table align="left" border="0" cellpadding="0" cellspacing="0" width="270" style="width: 100%; max-width: 270px; margin-bottom: 15px;">
                            <tr>
                                <td>
                                    <div style="font-weight: bold; font-size: 12px; color: #2d3748; letter-spacing: 0.5px; border-left: 2px solid #4a5568; padding-left: 8px; margin-bottom: 6px;">MEPPAYUR</div>
                                    <table border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; color: #4a5568;">
                                        <tr>
                                            <td style="padding-bottom: 4px; padding-left: 8px;">
                                                <span style="margin-right: 4px;">📞</span> 
                                                <a href="tel:9188331197" style="color: #2b6cb0; text-decoration: none; font-weight: 500;">9188331197</a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding-left: 8px;">
                                                <span style="margin-right: 4px;">✉️</span> 
                                                <a href="mailto:sargaoffssetmpr@gmail.com" style="color: #2b6cb0; text-decoration: none;">sargaoffssetmpr@gmail.com</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <!--[if (gte mso 9)|(IE)]>
                        </td>
                        </tr>
                        </table>
                        <![endif]-->
                    </td>
                </tr>
            </table>
        </div>`;

        await sendEmail({
            to: targetEmail,
            from: `"${companyName}" <${process.env.EMAIL_FROM || 'sargadailyreport@gmail.com'}>`,
            subject: invoiceSubject,
            text: invoiceMessage,
            html: htmlBody
        });

        // Track send in invoice_tracking
        await pool.query(
            `INSERT INTO sarga_invoice_tracking (payment_id, status, sent_at, sent_to_email)
             VALUES (?, 'sent', NOW(), ?)
             ON DUPLICATE KEY UPDATE status='sent', sent_at=NOW(), sent_to_email=?`,
            [paymentId, targetEmail, targetEmail]
        ).catch(() => {});

        res.json({ message: 'Invoice sent successfully' });
    } catch (err) {
        console.error('Send invoice email error:', err);
        res.status(500).json({ message: err.message || 'Failed to send email. Check email configuration.' });
    }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 4: Recurring Invoices
// ──────────────────────────────────────────────────────────────
router.get('/recurring-invoices', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_recurring_invoices ORDER BY next_date ASC');
        res.json(rows);
    } catch (err) {
        console.error('List recurring invoices error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.post('/recurring-invoices', authenticateToken, async (req, res) => {
    try {
        const { customer_id, customer_name, customer_mobile, customer_email, frequency,
            items, subtotal, discount_percent, tax_rate, total, next_date, end_date, branch_id } = req.body;
        const [result] = await pool.query(
            `INSERT INTO sarga_recurring_invoices
             (customer_id, customer_name, customer_mobile, customer_email, frequency, items, subtotal, discount_percent, tax_rate, total, next_date, end_date, branch_id, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [customer_id, customer_name, customer_mobile, customer_email, frequency,
                JSON.stringify(items || []), subtotal || 0, discount_percent || 0, tax_rate || 0, total || 0,
                next_date, end_date || null, branch_id || req.user.branch_id || null, req.user.id]
        );
        res.status(201).json({ id: result.insertId, message: 'Recurring invoice created' });
    } catch (err) {
        console.error('Create recurring invoice error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/recurring-invoices/:id', authenticateToken, async (req, res) => {
    try {
        const { customer_id, customer_name, customer_mobile, customer_email, frequency,
            items, subtotal, discount_percent, tax_rate, total, next_date, end_date, is_active } = req.body;
        await pool.query(
            `UPDATE sarga_recurring_invoices SET customer_id=?, customer_name=?, customer_mobile=?, customer_email=?,
             frequency=?, items=?, subtotal=?, discount_percent=?, tax_rate=?, total=?, next_date=?, end_date=?, is_active=?
             WHERE id=?`,
            [customer_id, customer_name, customer_mobile, customer_email, frequency,
                JSON.stringify(items || []), subtotal || 0, discount_percent || 0, tax_rate || 0, total || 0,
                next_date, end_date || null, is_active !== undefined ? is_active : true, req.params.id]
        );
        res.json({ message: 'Recurring invoice updated' });
    } catch (err) {
        console.error('Update recurring invoice error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.delete('/recurring-invoices/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM sarga_recurring_invoices WHERE id = ?', [req.params.id]);
        res.json({ message: 'Recurring invoice deleted' });
    } catch (err) {
        console.error('Delete recurring invoice error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ── Process due recurring invoices (called by cron or manually) ─
router.post('/recurring-invoices/process', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const today = new Date().toISOString().slice(0, 10);
        const [due] = await conn.query(
            'SELECT * FROM sarga_recurring_invoices WHERE is_active = TRUE AND next_date <= ? AND (end_date IS NULL OR end_date >= ?)',
            [today, today]
        );
        let generated = 0;
        for (const ri of due) {
            const items = typeof ri.items === 'string' ? JSON.parse(ri.items) : (ri.items || []); // eslint-disable-line no-unused-vars
            // Create invoice from recurring template
            await conn.query(
                `INSERT INTO sarga_customer_payments
                 (customer_id, customer_name, customer_mobile, bill_amount, total_amount, net_amount,
                  sgst_amount, cgst_amount, discount_percent, discount_amount, payment_method, branch_id,
                  description, verification_status, payment_date)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [ri.customer_id, ri.customer_name, ri.customer_mobile, ri.subtotal, ri.total, ri.total,
                    (ri.total * (ri.tax_rate / 100)) / 2, (ri.total * (ri.tax_rate / 100)) / 2,
                    ri.discount_percent, ri.subtotal * (ri.discount_percent / 100),
                    'pending', ri.branch_id, `Auto-generated from recurring invoice #${ri.id}`, 'pending', today]
            );
            // Calculate next date
            let nextDate = new Date(ri.next_date);
            switch (ri.frequency) {
                case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
                case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
                case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
                case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
                case 'annually': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
            }
            await conn.query('UPDATE sarga_recurring_invoices SET next_date = ?, last_generated_at = NOW() WHERE id = ?',
                [nextDate.toISOString().slice(0, 10), ri.id]);
            generated++;
        }
        res.json({ message: `Processed ${generated} recurring invoices` });
    } catch (err) {
        console.error('Process recurring invoices error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 5 & 6: Invoice Status Workflow + Overdue Tracking
// ──────────────────────────────────────────────────────────────
router.get('/invoice-tracking/:paymentId', authenticateToken, async (req, res) => {
    try {
        const [[tracking]] = await pool.query(
            'SELECT * FROM sarga_invoice_tracking WHERE payment_id = ?', [req.params.paymentId]
        );
        res.json(tracking || { payment_id: req.params.paymentId, status: 'draft' });
    } catch (err) {
        console.error('Get invoice tracking error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/invoice-tracking/:paymentId', authenticateToken, async (req, res) => {
    try {
        const { status, due_date, notes } = req.body;
        const paid_at = status === 'paid' ? new Date() : null;
        await pool.query(
            `INSERT INTO sarga_invoice_tracking (payment_id, status, due_date, notes, paid_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status=VALUES(status), due_date=VALUES(due_date), notes=VALUES(notes), paid_at=VALUES(paid_at)`,
            [req.params.paymentId, status, due_date || null, notes || null, paid_at]
        );
        res.json({ message: 'Invoice status updated' });
    } catch (err) {
        console.error('Update invoice tracking error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Mark overdue invoices (can be called by cron)
router.post('/invoice-tracking/check-overdue', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const [result] = await pool.query(
            `UPDATE sarga_invoice_tracking
             SET is_overdue = TRUE, status = 'overdue'
             WHERE due_date < ? AND status NOT IN ('paid','cancelled','refunded') AND is_overdue = FALSE`,
            [today]
        );
        res.json({ message: `Marked ${result.affectedRows} invoices as overdue` });
    } catch (err) {
        console.error('Check overdue error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// Dashboard: overdue summary
router.get('/invoice-tracking/overdue-summary', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT it.*, cp.customer_name, cp.customer_mobile, cp.total_amount, cp.net_amount, cp.payment_date
            FROM sarga_invoice_tracking it
            JOIN sarga_customer_payments cp ON cp.id = it.payment_id
            WHERE it.is_overdue = TRUE AND it.status = 'overdue'
            ORDER BY it.due_date ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Overdue summary error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 7: Tax Management Settings
// ──────────────────────────────────────────────────────────────
router.get('/tax-settings', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_tax_settings ORDER BY rate ASC');
        res.json(rows);
    } catch (err) {
        console.error('List tax settings error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.post('/tax-settings', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { name, rate, type, is_default, applies_to } = req.body;
        if (!name || rate === undefined) return res.status(400).json({ message: 'Name and rate are required' });
        if (is_default) await pool.query('UPDATE sarga_tax_settings SET is_default = FALSE');
        const [result] = await pool.query(
            'INSERT INTO sarga_tax_settings (name, rate, type, is_default, applies_to) VALUES (?,?,?,?,?)',
            [name, rate, type || 'percentage', is_default || false, applies_to || 'all']
        );
        res.status(201).json({ id: result.insertId, message: 'Tax setting created' });
    } catch (err) {
        console.error('Create tax setting error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/tax-settings/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { name, rate, type, is_default, is_active, applies_to } = req.body;
        if (is_default) await pool.query('UPDATE sarga_tax_settings SET is_default = FALSE');
        await pool.query(
            'UPDATE sarga_tax_settings SET name=?, rate=?, type=?, is_default=?, is_active=?, applies_to=? WHERE id=?',
            [name, rate, type || 'percentage', is_default || false, is_active !== undefined ? is_active : true, applies_to || 'all', req.params.id]
        );
        res.json({ message: 'Tax setting updated' });
    } catch (err) {
        console.error('Update tax setting error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.delete('/tax-settings/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM sarga_tax_settings WHERE id = ?', [req.params.id]);
        res.json({ message: 'Tax setting deleted' });
    } catch (err) {
        console.error('Delete tax setting error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 8: Payment Mode Management
// ──────────────────────────────────────────────────────────────
router.get('/payment-modes', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sarga_payment_modes ORDER BY sort_order ASC');
        res.json(rows);
    } catch (err) {
        console.error('List payment modes error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.post('/payment-modes', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { name, description, is_default, sort_order } = req.body;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        if (is_default) await pool.query('UPDATE sarga_payment_modes SET is_default = FALSE');
        const [result] = await pool.query(
            'INSERT INTO sarga_payment_modes (name, description, is_default, sort_order) VALUES (?,?,?,?)',
            [name, description || '', is_default || false, sort_order || 0]
        );
        res.status(201).json({ id: result.insertId, message: 'Payment mode created' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Payment mode already exists' });
        console.error('Create payment mode error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/payment-modes/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const { name, description, is_default, is_active, sort_order } = req.body;
        if (is_default) await pool.query('UPDATE sarga_payment_modes SET is_default = FALSE');
        await pool.query(
            'UPDATE sarga_payment_modes SET name=?, description=?, is_default=?, is_active=?, sort_order=? WHERE id=?',
            [name, description, is_default || false, is_active !== undefined ? is_active : true, sort_order || 0, req.params.id]
        );
        res.json({ message: 'Payment mode updated' });
    } catch (err) {
        console.error('Update payment mode error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.delete('/payment-modes/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM sarga_payment_modes WHERE id = ?', [req.params.id]);
        res.json({ message: 'Payment mode deleted' });
    } catch (err) {
        console.error('Delete payment mode error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 11: Company Settings / Branding
// ──────────────────────────────────────────────────────────────
router.get('/company-settings', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
        const obj = {};
        rows.forEach(r => { obj[r.setting_key] = r.setting_value; });
        res.json(obj);
    } catch (err) {
        console.error('Get company settings error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/company-settings', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const entries = Object.entries(req.body);
        for (const [key, value] of entries) {
            await conn.query(
                'INSERT INTO sarga_company_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [key, value || '']
            );
        }
        await conn.commit();
        res.json({ message: 'Company settings updated' });
    } catch (err) {
        await conn.rollback();
        console.error('Update company settings error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

// ──────────────────────────────────────────────────────────────
// FEATURE 10: i18n (language overrides)
// ──────────────────────────────────────────────────────────────
router.get('/i18n/:locale', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT message_key, message_value FROM sarga_i18n_overrides WHERE locale = ?', [req.params.locale]);
        const obj = {};
        rows.forEach(r => { obj[r.message_key] = r.message_value; });
        res.json(obj);
    } catch (err) {
        console.error('Get i18n error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

router.put('/i18n/:locale', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const [key, value] of Object.entries(req.body)) {
            await conn.query(
                'INSERT INTO sarga_i18n_overrides (locale, message_key, message_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE message_value=VALUES(message_value)',
                [req.params.locale, key, value]
            );
        }
        await conn.commit();
        res.json({ message: 'Translations updated' });
    } catch (err) {
        await conn.rollback();
        console.error('Update i18n error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

module.exports = router;
