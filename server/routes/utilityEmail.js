const router = require('express').Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { runNow } = require('../services/billScheduler');

const { verifyMailTransport, sendEmail } = require('../utils/mailer');

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
