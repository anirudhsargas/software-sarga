// ─── Invoice Email, Recurring, Status Workflow, Expiry/Overdue ─
// Features 2, 4, 5, 6, 8: customer-facing email, recurring billing, status, overdue, payment modes
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// ── Ensure tables ────────────────────────────────────────────
const ensureTables = async () => {
    const conn = await pool.getConnection();
    try {
        // Invoice tracking table (extends existing customer_payments)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_invoice_tracking (
                id INT AUTO_INCREMENT PRIMARY KEY,
                payment_id INT NOT NULL UNIQUE,
                status ENUM('draft','pending','sent','paid','partially_paid','overdue','cancelled','refunded','on_hold') DEFAULT 'draft',
                due_date DATE,
                sent_at DATETIME,
                sent_to_email VARCHAR(150),
                paid_at DATETIME,
                is_overdue BOOLEAN DEFAULT FALSE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (payment_id) REFERENCES sarga_customer_payments(id) ON DELETE CASCADE
            )
        `);

        try {
            await conn.query(`ALTER TABLE sarga_invoice_tracking ADD UNIQUE KEY uq_payment_id (payment_id)`);
        } catch (err) {
            // Ignore if index/unique key already exists
        }

        // Recurring invoice templates
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_recurring_invoices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT,
                customer_name VARCHAR(150),
                customer_mobile VARCHAR(20),
                customer_email VARCHAR(150),
                frequency ENUM('daily','weekly','monthly','quarterly','annually') NOT NULL,
                items JSON,
                subtotal DECIMAL(12,2) DEFAULT 0,
                discount_percent DECIMAL(5,2) DEFAULT 0,
                tax_rate DECIMAL(5,2) DEFAULT 0,
                total DECIMAL(12,2) DEFAULT 0,
                next_date DATE NOT NULL,
                end_date DATE,
                is_active BOOLEAN DEFAULT TRUE,
                last_generated_at DATETIME,
                branch_id INT,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
            )
        `);

        // Payment modes table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_payment_modes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                is_default BOOLEAN DEFAULT FALSE,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tax settings table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_tax_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                rate DECIMAL(5,2) NOT NULL,
                type ENUM('percentage','fixed') DEFAULT 'percentage',
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                applies_to ENUM('all','product','service') DEFAULT 'all',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Company settings table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_company_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // i18n language preferences
        await conn.query(`
            CREATE TABLE IF NOT EXISTS sarga_i18n_overrides (
                id INT AUTO_INCREMENT PRIMARY KEY,
                locale VARCHAR(10) NOT NULL DEFAULT 'en',
                message_key VARCHAR(200) NOT NULL,
                message_value TEXT NOT NULL,
                UNIQUE KEY uq_locale_key (locale, message_key)
            )
        `);

        // Seed default payment modes
        await conn.query(`INSERT IGNORE INTO sarga_payment_modes (name, description, is_default, sort_order) VALUES
            ('Cash', 'Cash payment', TRUE, 1),
            ('UPI', 'UPI payment', FALSE, 2),
            ('Bank Transfer', 'Bank/NEFT/RTGS transfer', FALSE, 3),
            ('Cheque', 'Cheque payment', FALSE, 4),
            ('Credit', 'Credit/Due payment', FALSE, 5)
        `);

        // Seed default tax settings
        await conn.query(`INSERT IGNORE INTO sarga_tax_settings (name, rate, is_default, applies_to) VALUES
            ('GST 5%', 5, FALSE, 'all'),
            ('GST 12%', 12, FALSE, 'all'),
            ('GST 18%', 18, TRUE, 'all'),
            ('GST 28%', 28, FALSE, 'all'),
            ('No Tax', 0, FALSE, 'all')
        `);

        // Seed default company settings
        await conn.query(`INSERT IGNORE INTO sarga_company_settings (setting_key, setting_value) VALUES
            ('company_name', 'Sarga Digital Press'),
            ('company_address', ''),
            ('company_phone', ''),
            ('company_email', ''),
            ('company_gst', ''),
            ('company_logo_url', ''),
            ('invoice_prefix', 'INV'),
            ('invoice_footer_text', 'Thank you for your business!'),
            ('invoice_terms', 'Payment due within 30 days.'),
            ('default_currency', 'INR'),
            ('default_language', 'en')
        `);

        // Add converted_from_quote column to customer_payments if not exists
        try {
            await conn.query(`ALTER TABLE sarga_customer_payments ADD COLUMN converted_from_quote INT DEFAULT NULL`);
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('converted_from_quote column may already exist'); }

    } finally { conn.release(); }
};
ensureTables().catch(e => console.error('Invoice features tables init error:', e));

// ──────────────────────────────────────────────────────────────
// FEATURE 2: Email Invoice to Client
// ──────────────────────────────────────────────────────────────
function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_FROM || '',
            pass: process.env.EMAIL_PASS || ''
        }
    });
}

router.post('/invoices/:paymentId/send-email', authenticateToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { email, subject, message } = req.body;

        if (!email) return res.status(400).json({ message: 'Email address is required' });

        const [[payment]] = await pool.query(
            `SELECT cp.*, c.email as customer_email_db
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_customers c ON c.id = cp.customer_id
             WHERE cp.id = ?`, [paymentId]
        );
        if (!payment) return res.status(404).json({ message: 'Invoice not found' });

        // Get company settings for branding
        const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
        const config = {};
        settings.forEach(s => { config[s.setting_key] = s.setting_value; });

        const companyName = config.company_name || 'Sarga Digital Press';
        const footerText = config.invoice_footer_text || 'Thank you for your business!';

        const invoiceSubject = subject || `Invoice #${payment.id} from ${companyName}`;
        const invoiceMessage = message || `Dear ${payment.customer_name || 'Customer'},\n\nPlease find your invoice details below.\n\nInvoice #: ${payment.id}\nAmount: ₹${payment.total_amount || payment.net_amount || 0}\nDate: ${payment.payment_date}\n\n${footerText}\n\n${companyName}`;

        const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">${companyName}</h1>
                <p style="margin: 4px 0 0; opacity: 0.8;">Invoice #${payment.id}</p>
            </div>
            <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                <p>Dear <strong>${payment.customer_name || 'Customer'}</strong>,</p>
                <p>${message || 'Please find your invoice details below.'}</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.id}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.payment_date}</td></tr>
                    <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd;">₹${Number(payment.total_amount || payment.net_amount || 0).toLocaleString('en-IN')}</td></tr>
                    <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.verification_status || 'Pending'}</td></tr>
                </table>
                <p style="color: #666; font-size: 13px;">${footerText}</p>
            </div>
            <div style="text-align: center; padding: 12px; background: #f5f5f5; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
                ${companyName} ${config.company_phone ? '| ' + config.company_phone : ''} ${config.company_email ? '| ' + config.company_email : ''}
            </div>
        </div>`;

        const transporter = getTransporter();
        await transporter.sendMail({
            from: `"${companyName}" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: invoiceSubject,
            text: invoiceMessage,
            html: htmlBody
        });

        // Track send in invoice_tracking
        await pool.query(
            `INSERT INTO sarga_invoice_tracking (payment_id, status, sent_at, sent_to_email)
             VALUES (?, 'sent', NOW(), ?)
             ON DUPLICATE KEY UPDATE status='sent', sent_at=NOW(), sent_to_email=?`,
            [paymentId, email, email]
        );

        res.json({ message: 'Invoice sent successfully' });
    } catch (err) {
        console.error('Send invoice email error:', err);
        res.status(500).json({ message: 'Failed to send email. Check email configuration.' });
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
            const items = typeof ri.items === 'string' ? JSON.parse(ri.items) : (ri.items || []);
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
