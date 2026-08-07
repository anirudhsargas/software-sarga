// ─── Quote / Proforma Management ──────────────────────────────
// Features 1, 9, 5 (partial): Full CRUD for quotes, convert quote→invoice
const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { paginate } = require('../helpers/pagination');


// ── Generate next quote number ───────────────────────────────
async function nextQuoteNumber() {
    const year = new Date().getFullYear();
    const prefix = `QT-${year}-`;
    const [[row]] = await pool.query(
        `SELECT quote_number FROM sarga_quotes WHERE quote_number LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`]
    );
    const seq = row ? parseInt(row.quote_number.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ── LIST quotes ──────────────────────────────────────────────
router.get('/quotes', authenticateToken, async (req, res) => {
    try {
        const { search, status } = req.query;
        const { limit, offset, _page, response } = paginate(req.query);
        let where = '1=1';
        const params = [];
        if (req.user.role !== 'Admin') {
            where += ' AND q.branch_id = ?';
            params.push(req.user.branch_id);
        }
        if (status) { where += ' AND q.status = ?'; params.push(status); }
        if (search) {
            where += ' AND (q.quote_number LIKE ? OR q.customer_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM sarga_quotes q WHERE ${where}`, params);
        const [rows] = await pool.query(
            `SELECT q.* FROM sarga_quotes q WHERE ${where} ORDER BY q.id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        res.json(response(rows, total));
    } catch (err) {
        console.error('List quotes error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ── GET single quote with items ──────────────────────────────
router.get('/quotes/:id', authenticateToken, async (req, res) => {
    try {
        const [[quote]] = await pool.query('SELECT * FROM sarga_quotes WHERE id = ?', [req.params.id]);
        if (!quote) return res.status(404).json({ message: 'Quote not found' });
        if (req.user.role !== 'Admin' && Number(quote.branch_id) !== Number(req.user.branch_id)) {
            return res.status(403).json({ error: 'Access denied: quote belongs to a different branch.' });
        }
        const [items] = await pool.query('SELECT * FROM sarga_quote_items WHERE quote_id = ?', [req.params.id]);
        res.json({ ...quote, items });
    } catch (err) {
        console.error('Get quote error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ── CREATE quote ─────────────────────────────────────────────
router.post('/quotes', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const { customer_id, customer_name, customer_mobile, customer_email, customer_address, customer_gst,
            date, valid_until, notes, items = [], discount_percent = 0, tax_rate = 0, branch_id: bodyBranchId } = req.body;

        const branch_id = req.user.role === 'Admin' ? (bodyBranchId || req.user.branch_id) : req.user.branch_id;
        const quote_number = await nextQuoteNumber();
        const subtotal = items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0);
        const discount_amount = subtotal * (discount_percent / 100);
        const after_discount = subtotal - discount_amount;
        const tax_amount = after_discount * (tax_rate / 100);
        const total = after_discount + tax_amount;

        const [result] = await conn.query(
            `INSERT INTO sarga_quotes (quote_number, customer_id, customer_name, customer_phone, customer_email, customer_address, customer_gst,
             date, valid_until, notes, subtotal, discount_percent, discount_amount, tax_rate, tax_amount, total, branch_id, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [quote_number, customer_id || null, customer_name, customer_mobile, customer_email, customer_address, customer_gst,
                date || new Date().toISOString().slice(0, 10), valid_until || null, notes,
                subtotal, discount_percent, discount_amount, tax_rate, tax_amount, total,
                branch_id || null, req.user.id]
        );
        const quoteId = result.insertId;
        for (const it of items) {
            const qty = it.quantity || 1;
            const price = it.unit_price || 0;
            await conn.query(
                `INSERT INTO sarga_quote_items (quote_id, item_name, description, quantity, unit_price, total) VALUES (?,?,?,?,?,?)`,
                [quoteId, it.item_name, it.description || '', qty, price, qty * price]
            );
        }
        await conn.commit();
        res.status(201).json({ id: quoteId, quote_number, total });
    } catch (err) {
        await conn.rollback();
        console.error('Create quote error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

// ── UPDATE quote ─────────────────────────────────────────────
router.put('/quotes/:id', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[existingQuote]] = await conn.query('SELECT branch_id FROM sarga_quotes WHERE id = ?', [req.params.id]);
        if (!existingQuote) {
            await conn.rollback();
            return res.status(404).json({ message: 'Quote not found' });
        }
        if (req.user.role !== 'Admin' && Number(existingQuote.branch_id) !== Number(req.user.branch_id)) {
            await conn.rollback();
            return res.status(403).json({ error: 'Access denied: quote belongs to a different branch.' });
        }

        const { customer_id, customer_name, customer_mobile, customer_email, customer_address, customer_gst,
            date, valid_until, status, notes, items = [], discount_percent = 0, tax_rate = 0 } = req.body;

        const subtotal = items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0);
        const discount_amount = subtotal * (discount_percent / 100);
        const after_discount = subtotal - discount_amount;
        const tax_amount = after_discount * (tax_rate / 100);
        const total = after_discount + tax_amount;

        await conn.query(
            `UPDATE sarga_quotes SET customer_id=?, customer_name=?, customer_mobile=?, customer_email=?, customer_address=?, customer_gst=?,
             date=?, valid_until=?, status=?, notes=?, subtotal=?, discount_percent=?, discount_amount=?, tax_rate=?, tax_amount=?, total=?
             WHERE id=?`,
            [customer_id || null, customer_name, customer_mobile, customer_email, customer_address, customer_gst,
                date, valid_until, status, notes, subtotal, discount_percent, discount_amount, tax_rate, tax_amount, total, req.params.id]
        );
        // Replace items
        await conn.query('DELETE FROM sarga_quote_items WHERE quote_id = ?', [req.params.id]);
        for (const it of items) {
            const qty = it.quantity || 1;
            const price = it.unit_price || 0;
            await conn.query(
                `INSERT INTO sarga_quote_items (quote_id, item_name, description, quantity, unit_price, total) VALUES (?,?,?,?,?,?)`,
                [req.params.id, it.item_name, it.description || '', qty, price, qty * price]
            );
        }
        await conn.commit();
        res.json({ message: 'Quote updated' });
    } catch (err) {
        await conn.rollback();
        console.error('Update quote error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

// ── DELETE quote ─────────────────────────────────────────────
router.delete('/quotes/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
    try {
        const [[existingQuote]] = await pool.query('SELECT branch_id FROM sarga_quotes WHERE id = ?', [req.params.id]);
        if (!existingQuote) return res.status(404).json({ message: 'Quote not found' });
        if (req.user.role !== 'Admin' && Number(existingQuote.branch_id) !== Number(req.user.branch_id)) {
            return res.status(403).json({ error: 'Access denied: quote belongs to a different branch.' });
        }

        await pool.query('DELETE FROM sarga_quotes WHERE id = ?', [req.params.id]);
        res.json({ message: 'Quote deleted' });
    } catch (err) {
        console.error('Delete quote error:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

// ── CONVERT quote → invoice (Feature 9) ─────────────────────
router.post('/quotes/:id/convert', authenticateToken, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[quote]] = await conn.query('SELECT * FROM sarga_quotes WHERE id = ?', [req.params.id]);
        if (!quote) { await conn.rollback(); return res.status(404).json({ message: 'Quote not found' }); }
        if (quote.status === 'converted') { await conn.rollback(); return res.status(400).json({ message: 'Quote already converted' }); }
        const [_items] = await conn.query('SELECT * FROM sarga_quote_items WHERE quote_id = ?', [req.params.id]);

        // Find or create customer
        let customerId = quote.customer_id;
        if (!customerId && quote.customer_mobile) {
            const [[existing]] = await conn.query('SELECT id FROM sarga_customers WHERE mobile = ?', [quote.customer_mobile]);
            if (existing) customerId = existing.id;
        }

        // Create a customer payment (invoice) record
        const [inv] = await conn.query(
            `INSERT INTO sarga_customer_payments
             (customer_id, customer_name, customer_mobile, bill_amount, total_amount, net_amount,
              sgst_amount, cgst_amount, discount_percent, discount_amount, payment_method, branch_id,
              description, verification_status, payment_date, converted_from_quote)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [customerId, quote.customer_name, quote.customer_mobile, quote.subtotal, quote.total, quote.total,
                quote.tax_amount / 2, quote.tax_amount / 2, quote.discount_percent, quote.discount_amount,
                'pending', quote.branch_id, `Converted from ${quote.quote_number}`, 'pending',
                new Date().toISOString().slice(0, 10), req.params.id]
        );

        // Mark quote as converted
        await conn.query('UPDATE sarga_quotes SET status = ?, converted_invoice_id = ? WHERE id = ?',
            ['converted', inv.insertId, req.params.id]);

        await conn.commit();
        res.json({ message: 'Quote converted to invoice', invoice_id: inv.insertId });
    } catch (err) {
        await conn.rollback();
        console.error('Convert quote error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally { conn.release(); }
});

// ── SEND quote via email (Feature 2) ─────────────────────────
router.post('/quotes/:id/send-email', authenticateToken, async (req, res) => {
    try {
        const [[quote]] = await pool.query('SELECT * FROM sarga_quotes WHERE id = ?', [req.params.id]);
        if (!quote) return res.status(404).json({ message: 'Quote not found' });

        const { email } = req.body;
        const toEmail = email || quote.customer_email;
        if (!toEmail) return res.status(400).json({ message: 'No email address. Provide one in request body.' });

        const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings').catch(() => [[]]);
        const cfg = {};
        (settings || []).forEach(s => { cfg[s.setting_key] = s.setting_value; });
        const companyName = cfg.company_name || 'Sarga Digital Press';

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_FROM || '', pass: process.env.EMAIL_PASS || '' }
        });

        const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#1a1a2e;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h2 style="margin:0">${companyName}</h2>
            <p style="margin:4px 0 0;opacity:.8">Quotation ${quote.quote_number}</p>
          </div>
          <div style="padding:20px;border:1px solid #eee;border-top:none">
            <p>Dear <strong>${quote.customer_name || 'Customer'}</strong>,</p>
            <p>Please find your quotation details below:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #ddd"><strong>Quote #</strong></td><td style="padding:8px;border:1px solid #ddd">${quote.quote_number}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd"><strong>Date</strong></td><td style="padding:8px;border:1px solid #ddd">${quote.date}</td></tr>
              ${quote.valid_until ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Valid Until</strong></td><td style="padding:8px;border:1px solid #ddd">${quote.valid_until}</td></tr>` : ''}
              <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #ddd"><strong>Subtotal</strong></td><td style="padding:8px;border:1px solid #ddd">₹${Number(quote.subtotal||0).toLocaleString('en-IN')}</td></tr>
              ${quote.discount_amount > 0 ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Discount</strong></td><td style="padding:8px;border:1px solid #ddd">-₹${Number(quote.discount_amount||0).toLocaleString('en-IN')}</td></tr>` : ''}
              ${quote.tax_amount > 0 ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Tax (${quote.tax_rate}%)</strong></td><td style="padding:8px;border:1px solid #ddd">₹${Number(quote.tax_amount||0).toLocaleString('en-IN')}</td></tr>` : ''}
              <tr style="background:#e8f5e9"><td style="padding:8px;border:1px solid #ddd"><strong>Total</strong></td><td style="padding:8px;border:1px solid #ddd;font-size:18px;font-weight:bold">₹${Number(quote.total||0).toLocaleString('en-IN')}</td></tr>
            </table>
            ${quote.notes ? `<p style="color:#666"><em>${quote.notes}</em></p>` : ''}
            <p style="color:#666;font-size:13px">${cfg.invoice_footer_text || 'Thank you for your business!'}</p>
          </div>
        </div>`;

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: toEmail,
            subject: req.body.subject || `Quotation ${quote.quote_number} from ${companyName}`,
            html
        });

        // Update status to sent
        await pool.query('UPDATE sarga_quotes SET status = ? WHERE id = ? AND status = ?',
            ['sent', req.params.id, 'draft']);

        res.json({ message: 'Quote sent successfully' });
    } catch (err) {
        console.error('Send quote email error:', err);
        res.status(500).json({ message: 'Failed to send email' });
    }
});

module.exports = router;
