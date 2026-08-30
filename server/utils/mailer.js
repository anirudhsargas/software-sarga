const nodemailer = require('nodemailer');

// Disable IPv6 interface detection in Nodemailer's internal resolver module.
// In cloud environments like Render/Docker, container network interfaces report IPv6 support (fe80:: / ::1),
// causing Nodemailer's internal resolver (shared.resolveHostname) to query resolve6 and attempt IPv6 connections,
// which fail with ENETUNREACH due to lack of outbound IPv6 routing.
try {
    const nmShared = require('nodemailer/lib/shared');
    if (nmShared && nmShared.networkInterfaces) {
        Object.keys(nmShared.networkInterfaces).forEach(key => {
            if (Array.isArray(nmShared.networkInterfaces[key])) {
                nmShared.networkInterfaces[key] = nmShared.networkInterfaces[key].filter(
                    i => i.family !== 'IPv6' && i.family !== 6
                );
            }
        });
    }
} catch (_err) {
    // Fallback gracefully if internal module structure changes
}

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
let cachedTransporter = null;

function createMailTransporter(options = {}) {
    const isDefault = Object.keys(options).length === 0;
    if (isDefault && cachedTransporter) {
        return cachedTransporter;
    }

    const smtpHost = options.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    let smtpPort = options.port || process.env.SMTP_PORT;
    const configuredSecure = options.secure !== undefined ? options.secure : process.env.SMTP_SECURE;
    let smtpSecure = configuredSecure === true || String(configuredSecure).toLowerCase() === 'true';
    // NOTE: Do NOT use EMAIL_FROM as auth user — it's the sender display address, not login credentials.
    // If EMAIL_FROM is set to a different account (e.g. old sargabilldesk), it would cause auth failures.
    const smtpUser = options.user || process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || 'sargabilldesk@gmail.com';
    const rawPass = options.pass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '';
    const smtpPass = rawPass ? String(rawPass).replace(/\s+/g, '') : '';

    if (!smtpPass) {
        throw new Error('No SMTP password found. Set EMAIL_PASS (or GMAIL_APP_PASSWORD) in your environment variables.');
    }

    const isGmail = smtpHost.toLowerCase().includes('gmail.com');
    // Gmail defaults to implicit TLS, but keep the port configurable because some hosts block 465.
    if (!smtpPort) {
        smtpPort = isGmail ? '465' : '587';
        smtpSecure = isGmail;
    }

    const portNum = parseInt(smtpPort || (smtpSecure ? '465' : '587'), 10);
    const secureBool = smtpSecure;

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: portNum,
        secure: secureBool,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000, // 10s connection timeout
        socketTimeout: 12000,     // 12s socket timeout
        // Forces IPv4 - Render's IPv6 egress can't reach Gmail's IPv6 SMTP endpoint
        family: 4
    });

    if (isDefault) {
        cachedTransporter = transporter;
    }

    return transporter;
}

/**
 * Send an email with anti-spam headers, plain text alternative, and proper MIME formatting.
 */
async function sendEmail({ to, subject, html, text, from, replyTo, attachments }) {
    if (!to || !to.trim()) {
        throw new Error('Recipient email address (to) is required.');
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || 'sargabilldesk@gmail.com';
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

    let info;
    try {
        info = await transporter.sendMail(mailOptions);
    } catch (err) {
        const isConnectionFailure = ['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(err?.code)
            || err?.command === 'CONN';
        const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

        // Try the other Gmail transport because cloud hosts may allow only one SMTP port.
        if (!isConnectionFailure || !smtpHost.toLowerCase().includes('gmail.com') || ![465, 587].includes(smtpPort)) {
            throw err;
        }

        const fallbackPort = smtpPort === 465 ? 587 : 465;
        const fallbackTransporter = createMailTransporter({
            host: smtpHost,
            port: fallbackPort,
            secure: fallbackPort === 465
        });
        info = await fallbackTransporter.sendMail(mailOptions);
    }
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
