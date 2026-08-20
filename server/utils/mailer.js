const nodemailer = require('nodemailer');

/**
 * Creates a unified Nodemailer transport supporting:
 * - Custom SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS)
 * - Standard Gmail fallback (EMAIL_FROM, EMAIL_PASS)
 * - Automatic cleaning of space-separated Google App Passwords
 * - Resilient TLS options
 */
function createMailTransporter(options = {}) {
    const smtpHost = options.host || process.env.SMTP_HOST;
    const smtpPort = options.port || process.env.SMTP_PORT;
    const smtpSecure = options.secure !== undefined ? options.secure : (process.env.SMTP_SECURE === 'true');
    const smtpUser = options.user || process.env.SMTP_USER || process.env.EMAIL_FROM || 'sargadailyreport@gmail.com';
    const rawPass = options.pass || process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    const smtpPass = rawPass ? String(rawPass).replace(/\s+/g, '') : '';

    if (!smtpPass) {
        throw new Error('EMAIL_PASS or SMTP_PASS environment variable is missing. Please set EMAIL_PASS in your server configuration.');
    }

    if (smtpHost) {
        return nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort || (smtpSecure ? '465' : '587'), 10),
            secure: Boolean(smtpSecure),
            auth: { user: smtpUser, pass: smtpPass },
            tls: { rejectUnauthorized: false }
        });
    }

    // Default to Gmail service
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        tls: { rejectUnauthorized: false }
    });
}

/**
 * Send an email with unified options, company branding, and error handling.
 */
async function sendEmail({ to, subject, html, text, from, attachments }) {
    if (!to || !to.trim()) {
        throw new Error('Recipient email address (to) is required.');
    }

    const emailFrom = process.env.EMAIL_FROM || 'sargadailyreport@gmail.com';
    const defaultSenderName = process.env.COMPANY_NAME || 'Sarga Offset';
    const formattedFrom = from || `"${defaultSenderName}" <${emailFrom}>`;

    const transporter = createMailTransporter();

    const mailOptions = {
        from: formattedFrom,
        to: to.trim(),
        subject: subject || 'Notification from Sarga Offset',
        text: text || '',
        html: html || text,
        attachments: attachments || []
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
}

/**
 * Verify current mail transport settings.
 */
async function verifyMailTransport() {
    const transporter = createMailTransporter();
    return await transporter.verify();
}

module.exports = {
    createMailTransporter,
    sendEmail,
    verifyMailTransport
};
