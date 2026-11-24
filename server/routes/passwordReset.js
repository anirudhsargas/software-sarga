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


const { createMailTransporter, sendEmail } = require('../utils/mailer');
const { isSmsConfigured, sendOtpSms } = require('../utils/sms');
const { auditLog } = require('../helpers');
const {
    issueAccessToken, createRefreshToken, revokeAllUserTokens, passwordPolicyError, sha256
} = require('../helpers/authTokens');

function getTransporter() {
    return createMailTransporter();
}

// ── Request password reset ───────────────────────────────────
router.post('/auth/forgot-password', resetLimiter, async (req, res) => {
    try {
        const { user_id, email: fallbackEmail } = req.body;
        if (!user_id) return res.status(400).json({ message: 'User ID (mobile number) is required' });

        const normalized = String(user_id).replace(/\D/g, '').slice(-10);
        if (normalized.length !== 10) return res.status(400).json({ message: 'Enter a valid 10-digit staff mobile number' });
        const [[user]] = await pool.query(
            'SELECT id, name, email FROM sarga_staff WHERE RIGHT(user_id, 10) = ?',
            [normalized]
        );

        // Always return success for security (don't reveal if user exists)
        if (!user) return res.json({ message: 'If the account can be recovered, a reset link has been sent.' });
        const savedEmail = String(user.email || '').trim();
        const enteredEmail = String(fallbackEmail || '').trim();
        if (!savedEmail && !enteredEmail) {
            return res.json({ requires_email: true, message: 'No recovery email is saved. Enter an email address to receive the reset link.' });
        }
        if (!savedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredEmail)) {
            return res.status(400).json({ message: 'Enter a valid email address' });
        }
        // Prefer the email already saved by the administrator. An email entered
        // during recovery is used only for this reset request.
        const recoveryEmail = savedEmail || enteredEmail;

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
        const resetUrl = `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;

        await sendEmail({
            from: `"Sarga Offset" <${process.env.EMAIL_FROM || 'sargabilldesk@gmail.com'}>`,
            to: recoveryEmail,
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

        res.json({ message: 'If the account can be recovered, a reset link has been sent.' });
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
        // Sign out every device that still holds the old password's sessions / refresh tokens
        await revokeAllUserTokens(record.staff_id);

        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

// ═══════════════════════════════════════════════════════════════
// Forgot password with a one-time code (email or SMS)
//   1. POST /auth/forgot-password/otp     { identifier }            → code sent to that email / mobile
//   2. POST /auth/forgot-password/verify  { identifier, otp }       → one-time reset token (10 min)
//   3. POST /auth/forgot-password/reset   { resetToken, newPassword, remember_me }
//                                          → password changed, other sessions revoked, logged in
// Responses never reveal whether an account exists for the identifier.
// ═══════════════════════════════════════════════════════════════
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const RESET_TOKEN_TTL_MINUTES = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

/** Classify what the user typed: { channel: 'email'|'sms', value } or null when invalid. */
function parseIdentifier(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    if (text.includes('@')) {
        return EMAIL_RE.test(text) ? { channel: 'email', value: text.toLowerCase() } : null;
    }
    const digits = text.replace(/\D/g, '');
    const mobile = digits.slice(-10);
    return mobile.length === 10 && digits.length <= 12 ? { channel: 'sms', value: mobile } : null;
}

async function findStaffByIdentifier(id) {
    if (id.channel === 'email') {
        const [rows] = await pool.query(
            'SELECT id, name, email, user_id FROM sarga_staff WHERE LOWER(TRIM(email)) = ? LIMIT 2',
            [id.value]
        );
        // An email shared by several staff can't identify one account — treat as no match.
        return rows.length === 1 ? rows[0] : null;
    }
    const [rows] = await pool.query(
        'SELECT id, name, email, user_id FROM sarga_staff WHERE RIGHT(user_id, 10) = ? LIMIT 1',
        [id.value]
    );
    return rows[0] || null;
}

const otpHash = (staffId, otp) => sha256(`reset:${staffId}:${otp}`);

// Step 1 — send the code
router.post('/auth/forgot-password/otp', resetLimiter, async (req, res) => {
    const id = parseIdentifier(req.body?.identifier);
    if (!id) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number or email address' });

    if (id.channel === 'sms' && !isSmsConfigured()) {
        return res.status(503).json({ message: "SMS codes aren't set up yet. Please use your email address instead.", code: 'SMS_NOT_CONFIGURED' });
    }

    const sentMessage = id.channel === 'email'
        ? 'If this email belongs to a staff account, a 6-digit code has been sent to it.'
        : 'If this mobile number belongs to a staff account, a 6-digit code has been sent by SMS.';

    try {
        const staff = await findStaffByIdentifier(id);
        if (!staff) return res.json({ message: sentMessage, channel: id.channel });

        const [[recent]] = await pool.query(
            `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM sarga_password_otps
             WHERE staff_id = ? AND purpose = 'reset_password' ORDER BY id DESC LIMIT 1`,
            [staff.id]
        );
        if (recent && recent.age < OTP_RESEND_COOLDOWN_SECONDS) {
            return res.status(429).json({ message: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS - recent.age}s before requesting another code.` });
        }

        const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await pool.query(
            "UPDATE sarga_password_otps SET used = 1 WHERE staff_id = ? AND purpose = 'reset_password' AND used = 0",
            [staff.id]
        );
        await pool.query(
            `INSERT INTO sarga_password_otps (staff_id, otp_hash, purpose, expires_at)
             VALUES (?, ?, 'reset_password', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
            [staff.id, otpHash(staff.id, otp), OTP_TTL_MINUTES]
        );

        if (id.channel === 'sms') {
            await sendOtpSms(id.value, otp);
        } else {
            await sendEmail({
                from: `"Sarga Offset" <${process.env.EMAIL_FROM || 'sargabilldesk@gmail.com'}>`,
                to: staff.email,
                subject: 'Your password reset code',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
                        <h2 style="margin: 0;">Password Reset Code</h2>
                    </div>
                    <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                        <p>Hi <strong>${String(staff.name || '').replace(/[<>&"]/g, '')}</strong>,</p>
                        <p>Use this code to reset your password:</p>
                        <p style="text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 24px 0;">${otp}</p>
                        <p style="color: #666; font-size: 13px;">The code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>
                    </div>
                </div>`
            });
        }

        auditLog(staff.id, 'PASSWORD_RESET_OTP_SENT', `Password reset code sent by ${id.channel}`);
        res.json({ message: sentMessage, channel: id.channel });
    } catch (err) {
        console.error('Forgot password OTP error:', err.message);
        res.status(500).json({ message: 'Could not send the code. Please try again.' });
    }
});

// Step 2 — verify the code, hand out a one-time reset token
router.post('/auth/forgot-password/verify', verifyLimiter, async (req, res) => {
    const id = parseIdentifier(req.body?.identifier);
    const otp = String(req.body?.otp || '').trim();
    if (!id || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Enter the 6-digit code' });

    const invalid = () => res.status(400).json({ message: 'Invalid or expired code' });
    try {
        const staff = await findStaffByIdentifier(id);
        if (!staff) return invalid();

        const [[record]] = await pool.query(
            `SELECT id, otp_hash, attempts, (expires_at > NOW()) AS active FROM sarga_password_otps
             WHERE staff_id = ? AND purpose = 'reset_password' AND used = 0 ORDER BY id DESC LIMIT 1`,
            [staff.id]
        );
        if (!record || !record.active) return invalid();
        if (record.attempts >= OTP_MAX_ATTEMPTS) {
            await pool.query('UPDATE sarga_password_otps SET used = 1 WHERE id = ?', [record.id]);
            return res.status(400).json({ message: 'Too many wrong attempts. Please request a new code.' });
        }

        const expected = Buffer.from(record.otp_hash, 'hex');
        const actual = Buffer.from(otpHash(staff.id, otp), 'hex');
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            await pool.query('UPDATE sarga_password_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
            const left = OTP_MAX_ATTEMPTS - record.attempts - 1;
            return res.status(400).json({ message: left > 0 ? `Incorrect code. ${left} attempt(s) left.` : 'Incorrect code. Please request a new one.' });
        }

        await pool.query('UPDATE sarga_password_otps SET used = 1 WHERE id = ?', [record.id]);

        // One-time reset token; only its hash is stored
        const resetToken = crypto.randomBytes(32).toString('hex');
        await pool.query('UPDATE sarga_password_reset_tokens SET used = TRUE WHERE staff_id = ? AND used = FALSE', [staff.id]);
        await pool.query(
            'INSERT INTO sarga_password_reset_tokens (staff_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
            [staff.id, sha256(resetToken), RESET_TOKEN_TTL_MINUTES]
        );

        res.json({ resetToken, expiresInMinutes: RESET_TOKEN_TTL_MINUTES });
    } catch (err) {
        console.error('Forgot password verify error:', err.message);
        res.status(500).json({ message: 'Could not verify the code. Please try again.' });
    }
});

// Step 3 — set the new password and log the user in
router.post('/auth/forgot-password/reset', verifyLimiter, async (req, res) => {
    const resetToken = String(req.body?.resetToken || '');
    const newPassword = req.body?.newPassword;
    if (!/^[a-f0-9]{64}$/.test(resetToken)) return res.status(400).json({ message: 'Your reset session has expired. Please start again.' });
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return res.status(400).json({ message: policyError });

    try {
        const [[record]] = await pool.query(
            'SELECT id, staff_id FROM sarga_password_reset_tokens WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [sha256(resetToken)]
        );
        if (!record) return res.status(400).json({ message: 'Your reset session has expired. Please start again.' });

        // Claim the token first so it can't be used twice in parallel
        const [claim] = await pool.query('UPDATE sarga_password_reset_tokens SET used = TRUE WHERE id = ? AND used = FALSE', [record.id]);
        if (!claim.affectedRows) return res.status(400).json({ message: 'Your reset session has expired. Please start again.' });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?', [hashed, record.staff_id]);
        await revokeAllUserTokens(record.staff_id);

        const [[user]] = await pool.query(
            `SELECT s.id, s.user_id, s.name, s.role, s.branch_id, s.is_first_login, s.image_url, s.settings,
                    b.short_name AS branch_short_name
             FROM sarga_staff s LEFT JOIN sarga_branches b ON b.id = s.branch_id WHERE s.id = ? LIMIT 1`,
            [record.staff_id]
        );
        const { token, expiresIn } = await issueAccessToken(user, req);
        const refresh = await createRefreshToken(user.id, req.body?.remember_me !== false, req);

        auditLog(user.id, 'PASSWORD_RESET', 'Password reset with one-time code');
        res.json({
            message: 'Password changed. You are now logged in.',
            token,
            expiresIn,
            refreshToken: refresh.refreshToken,
            refreshExpiresAt: refresh.refreshExpiresAt,
            user: {
                id: user.id,
                user_id: user.user_id,
                role: user.role,
                name: user.name,
                branch_id: user.branch_id || null,
                branch_short_name: user.branch_short_name || null,
                image_url: user.image_url || null,
                settings: user.settings || null,
                is_first_login: false
            }
        });
    } catch (err) {
        console.error('Forgot password reset error:', err.message);
        res.status(500).json({ message: 'Could not reset the password. Please try again.' });
    }
});

module.exports = router;
