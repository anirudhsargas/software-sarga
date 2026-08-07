// Auto-send invoice email after invoice creation.
// Reuses the same transport + branding as POST /invoices/:paymentId/send-email
const nodemailer = require('nodemailer');
const { pool } = require('../database');

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_FROM || '',
            pass: process.env.EMAIL_PASS || ''
        }
    });
}

async function buildEmailPayload(payment) {
    const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
    const config = {};
    settings.forEach((s) => { config[s.setting_key] = s.setting_value; });

    const companyName = config.company_name || 'Sarga Offset';
    const footerText = config.invoice_footer_text || 'Thank you for your business!';
    const amount = Number(payment.total_amount || payment.net_amount || 0);

    const invoiceSubject = `Invoice #${payment.id} from ${companyName}`;
    const invoiceMessage = `Dear ${payment.customer_name || 'Customer'},\n\nPlease find your invoice details below.\n\nInvoice #: ${payment.id}\nAmount: \u20B9${amount}\nDate: ${payment.payment_date}\n\n${footerText}\n\n${companyName}`;

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">${companyName}</h1>
            <p style="margin: 4px 0 0; opacity: 0.8;">Invoice #${payment.id}</p>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
            <p>Dear <strong>${payment.customer_name || 'Customer'}</strong>,</p>
            <p>Please find your invoice details below.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice #</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.id}</td></tr>
                <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.payment_date}</td></tr>
                <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 10px; border: 1px solid #ddd;">\u20B9${amount.toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${payment.verification_status || 'Pending'}</td></tr>
            </table>
            <p style="color: #666; font-size: 13px;">${footerText}</p>
        </div>
        <div style="text-align: center; padding: 12px; background: #f5f5f5; border-radius: 0 0 8px 8px; font-size: 12px; color: #999;">
            ${companyName} ${config.company_phone ? '| ' + config.company_phone : ''} ${config.company_email ? '| ' + config.company_email : ''}
        </div>
    </div>`;

    return { invoiceSubject, invoiceMessage, htmlBody, companyName };
}

/**
 * Auto-send an invoice email for a payment.
 * Only sends when the customer has an email address on file or provided.
 * Safe to call fire-and-forget; never throws to the caller.
 * Returns { sent: boolean, email, reason? }.
 */
async function sendInvoiceEmail(paymentId, overrideEmail) {
    try {
        const [[payment]] = await pool.query(
            `SELECT cp.*, c.email AS customer_email_db
             FROM sarga_customer_payments cp
             LEFT JOIN sarga_customers c ON c.id = cp.customer_id
             WHERE cp.id = ?`,
            [paymentId]
        );
        if (!payment) return { sent: false, reason: 'Payment not found' };

        const email = (overrideEmail || payment.customer_email || payment.customer_email_db || payment.email || '').trim();
        if (!email) {
            console.log(`[InvoiceEmail] No customer email available for payment #${paymentId}`);
            return { sent: false, email, reason: 'No customer email on file' };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            console.log(`[InvoiceEmail] Invalid email address "${email}" for payment #${paymentId}`);
            return { sent: false, email, reason: 'Invalid customer email' };
        }

        // Get company settings for SMTP credentials & branding fallback
        const [settings] = await pool.query('SELECT setting_key, setting_value FROM sarga_company_settings');
        const config = {};
        (settings || []).forEach((s) => { config[s.setting_key] = s.setting_value; });

        const emailFrom = process.env.EMAIL_FROM || config.email_from || config.smtp_user || 'sargadailyreport@gmail.com';
        const emailPass = process.env.EMAIL_PASS || config.email_pass || config.smtp_pass || '';

        if (!emailPass) {
            console.warn(`[InvoiceEmail] EMAIL_PASS not configured. Skipping email send for payment #${paymentId}`);
            return { sent: false, reason: 'Email SMTP password not configured' };
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailFrom,
                pass: emailPass
            }
        });

        const { invoiceSubject, invoiceMessage, htmlBody, companyName } = await buildEmailPayload(payment);

        await transporter.sendMail({
            from: `"${companyName}" <${emailFrom}>`,
            to: email,
            subject: invoiceSubject,
            text: invoiceMessage,
            html: htmlBody
        });

        await pool.query(
            `INSERT INTO sarga_invoice_tracking (payment_id, status, sent_at, sent_to_email)
             VALUES (?, 'sent', NOW(), ?)
             ON DUPLICATE KEY UPDATE status='sent', sent_at=NOW(), sent_to_email=?`,
            [paymentId, email, email]
        );

        console.log(`[InvoiceEmail] Auto-sent invoice #${paymentId} to ${email}`);
        return { sent: true, email };
    } catch (err) {
        console.error(`[InvoiceEmail] Auto-send failed for payment ${paymentId}:`, err.message || err);
        return { sent: false, reason: 'Failed to send' };
    }
}

module.exports = { sendInvoiceEmail };