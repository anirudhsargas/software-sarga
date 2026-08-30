const router = require('express').Router();
const dns = require('node:dns').promises;
const net = require('node:net');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { runNow } = require('../services/billScheduler');

const { verifyMailTransport, sendEmail } = require('../utils/mailer');

function checkTcpConnection(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, family: 4 });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish({ ok: false, code: 'ETIMEDOUT', message: `TCP connection timed out after ${timeoutMs}ms` }));
    socket.once('connect', () => finish({ ok: true }));
    socket.once('error', (err) => finish({ ok: false, code: err.code || 'TCP_ERROR', message: err.message }));
  });
}

function explainMailError(err) {
  const code = err?.code;
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code) || err?.command === 'CONN') {
    return 'Render cannot establish a TCP connection to the configured SMTP server. Check outbound SMTP access or use an email API provider.';
  }
  if (code === 'EAUTH' || err?.responseCode === 535) {
    return 'SMTP server is reachable, but Gmail rejected authentication. Recheck the account and create a new app password.';
  }
  if (code === 'ESOCKET' || err?.command === 'STARTTLS') {
    return 'SMTP server is reachable, but the TLS mode does not match the configured port. Use port 587 with SMTP_SECURE=false or port 465 with SMTP_SECURE=true.';
  }
  return 'SMTP verification failed. Check the detailed stage result and Render deployment logs.';
}

// Manual trigger to fetch utility bills from email
router.post('/utility-bills/fetch-from-email', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const report = await runNow();
    res.json({ success: true, report });
  } catch (err) {
    console.error('Manual bill fetch error:', err.message || err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Verify email server connection & SMTP credentials
router.get('/email/verify', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Super Admin'), async (req, res) => {
  try {
    await verifyMailTransport();
    res.json({ success: true, message: 'Mail server SMTP configuration is verified and working.' });
  } catch (err) {
    console.error('[MailVerify] Connection failed:', err);
    res.status(500).json({ success: false, message: 'SMTP connection failed', error: err.message || String(err) });
  }
});

// Diagnose DNS, TCP reachability, TLS, and SMTP authentication separately.
router.get('/email/diagnose', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Super Admin'), async (req, res) => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = String(process.env.SMTP_SECURE).toLowerCase() === 'true';
  const authConfigured = Boolean(
    process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD
  );
  const result = {
    success: false,
    config: { host, port, secure, userConfigured: Boolean(process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER), authConfigured },
    stages: {}
  };

  try {
    const addresses = await dns.lookup(host, { all: true, family: 4 });
    result.stages.dns = { ok: true, addresses: addresses.map(({ address }) => address) };
  } catch (err) {
    result.stages.dns = { ok: false, code: err.code || 'DNS_ERROR', message: err.message };
    result.diagnosis = 'SMTP hostname could not be resolved from Render. Check SMTP_HOST.';
    return res.status(503).json(result);
  }

  result.stages.tcp = await checkTcpConnection(host, port);
  if (!result.stages.tcp.ok) {
    result.diagnosis = explainMailError(result.stages.tcp);
    return res.status(503).json(result);
  }

  try {
    await verifyMailTransport();
    result.stages.smtp = { ok: true, message: 'SMTP handshake and authentication succeeded.' };
    result.success = true;
    return res.json(result);
  } catch (err) {
    result.stages.smtp = { ok: false, code: err.code || 'SMTP_ERROR', command: err.command, responseCode: err.responseCode, message: err.message };
    result.diagnosis = explainMailError(err);
    return res.status(503).json(result);
  }
});

// Send test email
router.post('/email/test', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Super Admin'), async (req, res) => {
  try {
    const { to } = req.body;
    const recipient = to || req.user?.email || process.env.EMAIL_TO || process.env.EMAIL_FROM;
    if (!recipient) return res.status(400).json({ success: false, message: 'Recipient email is required' });

    const info = await sendEmail({
      to: recipient,
      subject: 'Test Email — Sarga ERP System',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">Sarga ERP Email Test</h2>
          <p>This is a confirmation test email sent from your Sarga Offset ERP system.</p>
          <p style="color: #666; font-size: 13px;">If you received this message, your mail configuration is functioning correctly.</p>
        </div>`
    });

    res.json({ success: true, message: `Test email sent to ${recipient}`, messageId: info.messageId });
  } catch (err) {
    console.error('[MailTest] Failed to send test email:', err);
    res.status(500).json({ success: false, message: 'Failed to send test email', error: err.message || String(err) });
  }
});

module.exports = router;
