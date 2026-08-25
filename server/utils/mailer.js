const nodemailer = require('nodemailer');

/**
 * Utility function to convert HTML string to clean plain text for MIME multipart/alternative.
 * Having both text and html versions significantly reduces spam detection scores.
 */
function htmlToPlainText(html) {
    if (!html) return '';
    return String(html)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Creates a unified Nodemailer transport with anti-spam optimizations.
 */
function createMailTransporter(options = {}) {
    const smtpHost = options.host || process.env.SMTP_HOST;
    const smtpPort = options.port || process.env.SMTP_PORT;
    const smtpSecure = options.secure !== undefined ? options.secure : (process.env.SMTP_SECURE === 'true');
    const smtpUser = options.user || process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.EMAIL_FROM || 'sargadailyreport@gmail.com';
    const rawPass = options.pass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '';
    const smtpPass = rawPass ? String(rawPass).replace(/\s+/g, '') : '';

    if (!smtpPass) {
        throw new Error('EMAIL_PASS or GMAIL_APP_PASSWORD environment variable is missing. Please set GMAIL_APP_PASSWORD or EMAIL_PASS in your server configuration.');
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

    // Default to Gmail SMTP host directly (port 465 SSL) for robust DKIM signing & delivery
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        tls: { rejectUnauthorized: false }
    });
}

/**
 * Send an email with anti-spam headers, plain text alternative, and proper MIME formatting.
 */
async function sendEmail({ to, subject, html, text, from, replyTo, attachments }) {
    if (!to || !to.trim()) {
        throw new Error('Recipient email address (to) is required.');
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.GMAIL_USER || process.env.EMAIL_USER || 'sargadailyreport@gmail.com';
    const defaultSenderName = process.env.COMPANY_NAME || 'Sarga Offset';
    
    // Ensure from address matches authenticated user domain to prevent spoofing flags
    const formattedFrom = from || `"${defaultSenderName}" <${emailFrom}>`;
    const formattedReplyTo = replyTo || emailFrom;

    const htmlBody = html || `<p>${text || ''}</p>`;
    const plainTextBody = text || htmlToPlainText(htmlBody);

    const transporter = createMailTransporter();

    const mailOptions = {
        from: formattedFrom,
        to: to.trim(),
        replyTo: formattedReplyTo,
        subject: subject || 'Notification from Sarga Offset',
        text: plainTextBody,
        html: htmlBody,
        attachments: attachments || [],
        headers: {
            'X-Mailer': 'Sarga ERP Notification System',
            'X-Auto-Response-Suppress': 'OOF, AutoReply',
            'X-Report-Abuse-To': emailFrom
        }
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
    verifyMailTransport,
    htmlToPlainText
};
