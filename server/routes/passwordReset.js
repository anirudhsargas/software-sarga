// ─── Forgot Password / Self-Service Reset (Feature 3) ────────
const router = require('express').Router();
const { pool } = require('../database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

// Rate limiter: 5 attempts per 15 min
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Too many reset attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});


function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_FROM || '',
            pass: process.env.EMAIL_PASS || ''
        }
    });
}

// ── Request password reset ───────────────────────────────────
router.post('/auth/forgot-password', resetLimiter, async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ message: 'User ID (mobile number) is required' });

        const normalized = user_id.replace(/\D/g, '').slice(-10);
        const [[user]] = await pool.query(
            'SELECT id, name, email FROM sarga_staff WHERE RIGHT(user_id, 10) = ?',
            [normalized]
        );

        // Always return success for security (don't reveal if user exists)
        if (!user || !user.email) {
            return res.json({ message: 'If an account with that ID exists and has an email, a reset link has been sent.' });
        }

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Invalidate old tokens
        await pool.query('UPDATE sarga_password_reset_tokens SET used = TRUE WHERE staff_id = ? AND used = FALSE', [user.id]);

        // Save token
        await pool.query(
            'INSERT INTO sarga_password_reset_tokens (staff_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, token, expiresAt]
        );

        // Build reset URL — always use CLIENT_URL to prevent host-header injection
        const baseUrl = process.env.CLIENT_URL;
        if (!baseUrl) {
            console.error('[Password Reset] CLIENT_URL is not set. Cannot build reset link.');
            return res.status(500).json({ message: 'Server configuration error. Please contact support.' });
        }
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        const { sendEmail } = require('../utils/mailer');
        await sendEmail({
            from: `"Sarga Offset" <${process.env.EMAIL_FROM || 'sargadailyreport@gmail.com'}>`,
            to: user.email,
            subject: 'Password Reset Request',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0;">Password Reset</h2>
                </div>
                <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                    <p>Hi <strong>${user.name}</strong>,</p>
                    <p>You requested a password reset. Click the button below to set a new password:</p>
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
                </div>
            </div>`
        });

        res.json({ message: 'If an account with that ID exists and has an email, a reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: err.message || 'An error occurred. Please try again.' });
    }
});

// ── Verify token (check validity) ────────────────────────────
router.get('/auth/reset-password/verify', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ valid: false, message: 'Token is required' });

        const [[record]] = await pool.query(
            'SELECT * FROM sarga_password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );

        if (!record) return res.json({ valid: false, message: 'Invalid or expired token' });
        res.json({ valid: true });
    } catch (err) {
        console.error('Verify reset token error:', err);
        res.status(500).json({ valid: false, message: 'Error verifying token' });
    }
});

// ── Reset password with token ────────────────────────────────
router.post('/auth/reset-password', resetLimiter, async (req, res) => {
    try {
        const { token, new_password } = req.body;
        if (!token || !new_password) return res.status(400).json({ message: 'Token and new password are required' });
        if (new_password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

        const [[record]] = await pool.query(
            'SELECT * FROM sarga_password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );
        if (!record) return res.status(400).json({ message: 'Invalid or expired reset token' });

        // Hash and update password
        const hashed = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE sarga_staff SET password = ?, is_first_login = FALSE WHERE id = ?', [hashed, record.staff_id]);

        // Mark token used
        await pool.query('UPDATE sarga_password_reset_tokens SET used = TRUE WHERE id = ?', [record.id]);

        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

module.exports = router;
