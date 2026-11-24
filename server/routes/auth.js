const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles: _authorizeRoles, revokeSessionInCache } = require('../middleware/auth');
const { normalizeMobileWithCountry, auditLog } = require('../helpers');
const { validate, loginSchema, changePasswordSchema } = require('../middleware/validate');
const { createAuditEntry } = require('../services/auditService');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { fileToBase64 } = require('../utils/base64');
const { uploadBufferToCloudinary } = require('../helpers/cloudinaryUpload');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');
const {
    issueAccessToken, createRefreshToken, rotateRefreshToken, revokeRefreshToken,
    revokeAllUserTokens, passwordPolicyError, sha256
} = require('../helpers/authTokens');

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 attempts per window
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const publicUser = (user) => ({
    id: user.id,
    user_id: user.user_id,
    role: user.role,
    name: user.name,
    branch_id: user.branch_id || null,
    branch_short_name: user.branch_short_name || null,
    image_url: user.image_url || null,
    settings: user.settings || null,
    is_first_login: !!user.is_first_login
});

// OTP requests: 5 per 15 minutes per IP (plus a 60s per-user cooldown below)
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Too many OTP requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Refresh calls are frequent but cheap; still cap abuse.
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { message: 'Too many refresh attempts. Please log in again.' },
    standardHeaders: true,
    legacyHeaders: false
});

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

const maskEmail = (email) => {
    const [name, domain] = String(email).split('@');
    if (!domain) return email;
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
};

module.exports = (upload) => {

    // Exchange a refresh token for a fresh access token (refresh token is rotated)
    router.post('/auth/refresh', refreshLimiter, async (req, res) => {
        try {
            const result = await rotateRefreshToken(req.body?.refreshToken, req);
            res.json({
                token: result.token,
                expiresIn: result.expiresIn,
                refreshToken: result.refreshToken,
                refreshExpiresAt: result.refreshExpiresAt,
                user: publicUser(result.user)
            });
        } catch (err) {
            if (err.status === 401) return res.status(401).json({ message: err.message, code: 'REFRESH_INVALID' });
            console.error('Token refresh error:', err);
            res.status(500).json({ message: 'Could not refresh session' });
        }
    });

    // Change password without the current password: step 1 — email a one-time code
    router.post('/auth/change-password/otp', otpLimiter, authenticateToken, async (req, res) => {
        const userId = req.user.id;
        try {
            const [[staff]] = await pool.query('SELECT id, name, email FROM sarga_staff WHERE id = ?', [userId]);
            if (!staff) return res.status(404).json({ message: 'User not found' });
            const email = String(staff.email || '').trim();
            if (!email) {
                return res.status(400).json({ message: 'No email is saved on your account. Ask the Admin to add your email in Staff Management.' });
            }

            const [[recent]] = await pool.query(
                `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM sarga_password_otps
                 WHERE staff_id = ? AND purpose = 'change_password' ORDER BY id DESC LIMIT 1`,
                [userId]
            );
            if (recent && recent.age < OTP_RESEND_COOLDOWN_SECONDS) {
                return res.status(429).json({ message: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS - recent.age}s before requesting another code.` });
            }

            const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
            await pool.query(
                "UPDATE sarga_password_otps SET used = 1 WHERE staff_id = ? AND purpose = 'change_password' AND used = 0",
                [userId]
            );
            await pool.query(
                `INSERT INTO sarga_password_otps (staff_id, otp_hash, purpose, expires_at)
                 VALUES (?, ?, 'change_password', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
                [userId, sha256(`${userId}:${otp}`), OTP_TTL_MINUTES]
            );

            await sendEmail({
                from: `"Sarga Offset" <${process.env.EMAIL_FROM || 'sargabilldesk@gmail.com'}>`,
                to: email,
                subject: 'Your password change code',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; padding: 20px; background: #1a1a2e; color: white; border-radius: 8px 8px 0 0;">
                        <h2 style="margin: 0;">Password Change Code</h2>
                    </div>
                    <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                        <p>Hi <strong>${String(staff.name || '').replace(/[<>&"]/g, '')}</strong>,</p>
                        <p>Use this code to change your password:</p>
                        <p style="text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 24px 0;">${otp}</p>
                        <p style="color: #666; font-size: 13px;">The code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, ignore this email and tell your administrator.</p>
                    </div>
                </div>`
            });

            auditLog(userId, 'PASSWORD_OTP_SENT', 'Password change OTP emailed');
            res.json({ message: `A 6-digit code was sent to ${maskEmail(email)}`, email: maskEmail(email), expiresInMinutes: OTP_TTL_MINUTES });
        } catch (err) {
            console.error('Send password OTP error:', err);
            res.status(500).json({ message: 'Could not send the code. Please try again.' });
        }
    });

    // Change password without the current password: step 2 — verify code and set the new password
    router.post('/auth/change-password/otp/verify', authLimiter, authenticateToken, async (req, res) => {
        const userId = req.user.id;
        const otp = String(req.body?.otp || '').trim();
        const newPassword = req.body?.newPassword;
        if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Enter the 6-digit code from your email' });
        const policyError = passwordPolicyError(newPassword);
        if (policyError) return res.status(400).json({ message: policyError });

        try {
            const [[record]] = await pool.query(
                `SELECT id, otp_hash, attempts, (expires_at > NOW()) AS active FROM sarga_password_otps
                 WHERE staff_id = ? AND purpose = 'change_password' AND used = 0 ORDER BY id DESC LIMIT 1`,
                [userId]
            );
            if (!record || !record.active) {
                return res.status(400).json({ message: 'The code has expired. Please request a new one.' });
            }
            if (record.attempts >= OTP_MAX_ATTEMPTS) {
                await pool.query('UPDATE sarga_password_otps SET used = 1 WHERE id = ?', [record.id]);
                return res.status(400).json({ message: 'Too many wrong attempts. Please request a new code.' });
            }

            const expected = Buffer.from(record.otp_hash, 'hex');
            const actual = Buffer.from(sha256(`${userId}:${otp}`), 'hex');
            if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
                await pool.query('UPDATE sarga_password_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
                const left = OTP_MAX_ATTEMPTS - record.attempts - 1;
                return res.status(400).json({ message: left > 0 ? `Incorrect code. ${left} attempt(s) left.` : 'Incorrect code. Please request a new one.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query('UPDATE sarga_password_otps SET used = 1 WHERE id = ?', [record.id]);
            await pool.query('UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?', [hashedPassword, userId]);
            await revokeAllUserTokens(userId);

            auditLog(userId, 'PASSWORD_CHANGE', 'User changed password using email OTP');
            createAuditEntry(req, { module: 'Authentication', actionType: 'Update', recordType: 'Password', recordId: userId, responseStatus: 200, success: true, reasonRemarks: 'Password changed via email OTP' }).catch(() => {});
            res.json({ message: 'Password updated successfully. All sessions revoked.' });
        } catch (err) {
            console.error('Verify password OTP error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Login
    router.post('/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
        const { user_id, password } = req.body;
        const normalizedUserId = normalizeMobileWithCountry(user_id, req.body?.countryCode); // may return E.164 or fallback last-10
        const digits = String(user_id || '').replace(/\D/g, '');
        const last10 = digits.slice(-10);

        if (!normalizedUserId && last10.length !== 10) {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        try {
            const [users] = await pool.query(
                `SELECT s.id, s.user_id, s.name, s.role, s.password, s.branch_id, s.is_first_login, s.image_url, s.settings, b.short_name AS branch_short_name FROM sarga_staff s LEFT JOIN sarga_branches b ON b.id = s.branch_id WHERE (s.user_id = ? OR RIGHT(s.user_id, 10) = ?) LIMIT 1`,
                [normalizedUserId || last10, last10]
            );
            const user = users[0];

            if (!user) {
                createAuditEntry(req, { module: 'Authentication', actionType: 'Login', username: normalizedUserId || last10, responseStatus: 401, success: false, errorMessage: 'Invalid credentials - user not found' }).catch(() => {});
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                createAuditEntry(req, { module: 'Authentication', actionType: 'Login', username: user.user_id, employeeName: user.name, userRole: user.role, branchId: user.branch_id, responseStatus: 401, success: false, errorMessage: 'Invalid credentials - wrong password' }).catch(() => {});
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const { normalizeRole } = require('../middleware/auth');
            const userRoleNormalized = normalizeRole(user.role);

            // Short-lived access token (recorded as a revocable session) + rotating refresh token
            const { token, expiresIn } = await issueAccessToken(user, req);
            const rememberMe = req.body.remember_me !== false;
            let refresh = null;
            try {
                refresh = await createRefreshToken(user.id, rememberMe, req);
            } catch (refreshErr) {
                console.error('Refresh token creation failed (non-fatal):', refreshErr.message);
            }

            auditLog(user.id, 'LOGIN', `User ${user.user_id} logged in`);
            createAuditEntry(req, { module: 'Authentication', actionType: 'Login', username: user.user_id, employeeName: user.name, userRole: userRoleNormalized, branchId: user.branch_id, recordType: 'Session', recordId: user.id, responseStatus: 200, success: true, durationMs: Date.now() - req._startTime || 0 }).catch(() => {});

            res.json({
                token,
                expiresIn,
                refreshToken: refresh?.refreshToken || null,
                refreshExpiresAt: refresh?.refreshExpiresAt || null,
                user: publicUser(user)
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Change Password
    router.post('/auth/change-password', authLimiter, authenticateToken, validate(changePasswordSchema), async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        try {
            // Verify current password first
            const [users] = await pool.query("SELECT password, is_first_login FROM sarga_staff WHERE id = ?", [userId]);
            if (!users[0]) return res.status(404).json({ message: 'User not found' });

            if (!currentPassword || !String(currentPassword).trim()) {
                return res.status(400).json({ message: 'Current password is required for security' });
            }

            // Always require current password to prevent account takeover via stolen token.
            const validCurrent = await bcrypt.compare(currentPassword, users[0].password);
            if (!validCurrent) return res.status(401).json({ message: 'Current password is incorrect' });

            // Verify new password meets complexity requirements
            if (newPassword.length < 8) {
                return res.status(400).json({ message: 'Password must be at least 8 characters' });
            }
            if (!/[A-Z]/.test(newPassword)) {
                return res.status(400).json({ message: 'Password must contain at least one uppercase letter (A-Z)' });
            }
            if (!/[a-z]/.test(newPassword)) {
                return res.status(400).json({ message: 'Password must contain at least one lowercase letter (a-z)' });
            }
            if (!/[0-9]/.test(newPassword)) {
                return res.status(400).json({ message: 'Password must contain at least one number (0-9)' });
            }
            // eslint-disable-next-line no-useless-escape
            if (!/[@$!%*?&^#()_+\-=\[\]{};':",./<>?\|`~]/.test(newPassword)) {
                return res.status(400).json({ message: 'Password must contain at least one special character' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?", [hashedPassword, userId]);

            // Revoke ALL active sessions and refresh tokens for this user to force immediate logout
            await revokeAllUserTokens(userId);

            auditLog(userId, 'PASSWORD_CHANGE', 'User changed password with complexity requirements');
            createAuditEntry(req, { module: 'Authentication', actionType: 'Update', recordType: 'Password', recordId: userId, responseStatus: 200, success: true, reasonRemarks: 'Password changed successfully' }).catch(() => {});
            res.json({ message: 'Password updated successfully. All sessions revoked.' });
        } catch (err) {
            console.error('Change password error:', err);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Get Current Staff Profile
    router.get('/staff/me', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query(
                "SELECT id, user_id, name, role, branch_id, image_url, settings FROM sarga_staff WHERE id = ?",
                [req.user.id]
            );
            if (!rows[0]) return res.status(404).json({ message: 'User not found' });
            res.json(rows[0]);
        } catch (_err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Current Staff Profile
    router.put('/staff/me', authenticateToken, upload.single('image'), async (req, res) => {
        const { name } = req.body;
        // Cloudinary upload from buffer (memory storage)
        let imageUrl = null;
        if (req.file && req.file.buffer) {
            try {
                const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'staff-profiles');
                imageUrl = result.secure_url;
            } catch (_err) {
                return res.status(500).json({ message: 'Profile image upload failed' });
            }
        } else if (req.file && req.file.path) {
            // Fallback: local path (e.g. if old disk storage is still in use during transition)
            imageUrl = await fileToBase64(req.file.path).catch(() => null);
        }

        if (name !== undefined && !String(name).trim()) {
            return res.status(400).json({ message: 'Name is required' });
        }

        try {
            if (imageUrl && name !== undefined) {
                await pool.query(
                    "UPDATE sarga_staff SET name = ?, image_url = ? WHERE id = ?",
                    [String(name).trim(), imageUrl, req.user.id]
                );
            } else if (imageUrl) {
                await pool.query(
                    "UPDATE sarga_staff SET image_url = ? WHERE id = ?",
                    [imageUrl, req.user.id]
                );
            } else if (name !== undefined) {
                await pool.query(
                    "UPDATE sarga_staff SET name = ? WHERE id = ?",
                    [String(name).trim(), req.user.id]
                );
            } else {
                return res.status(400).json({ message: 'No changes provided' });
            }

            const [rows] = await pool.query(
                "SELECT id, user_id, name, role, branch_id, image_url, settings FROM sarga_staff WHERE id = ?",
                [req.user.id]
            );
            auditLog(req.user.id, 'PROFILE_UPDATE', 'Updated profile details');
            res.json(rows[0]);
        } catch (err) {
            console.error('Profile fetch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Staff Preferences
    router.patch('/staff/settings', authenticateToken, async (req, res) => {
        const { settings } = req.body;
        if (settings === undefined || settings === null) {
            return res.status(400).json({ message: 'Settings object is required' });
        }
        try {
            const [existing] = await pool.query(
                "SELECT settings FROM sarga_staff WHERE id = ?",
                [req.user.id]
            );
            const current = existing[0]?.settings ? (typeof existing[0].settings === 'string' ? JSON.parse(existing[0].settings) : existing[0].settings) : {};
            Object.assign(current, settings);
            await pool.query(
                "UPDATE sarga_staff SET settings = ? WHERE id = ?",
                [JSON.stringify(current), req.user.id]
            );
            res.json({ message: 'Settings saved', settings: current });
        } catch (err) {
            console.error('Settings update error:', err);
            res.status(500).json({ message: 'Failed to save settings' });
        }
    });

    // Logout endpoint
    router.post('/auth/logout', authenticateToken, async (req, res) => {
        try {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (token) {
                // Immediately mark revoked in Redis (fast path for future requests)
                await revokeSessionInCache(token);
                try {
                    await pool.query("UPDATE sarga_user_sessions SET is_revoked = 1 WHERE session_token = ?", [token]);
                } catch (sessionErr) {
                    console.error('Session revocation failed (non-fatal):', sessionErr.message);
                }
            }
            try {
                await revokeRefreshToken(req.body?.refreshToken);
            } catch (refreshErr) {
                console.error('Refresh token revocation failed (non-fatal):', refreshErr.message);
            }
            res.json({ message: 'Logged out successfully' });
        } catch (err) {
            console.error('Logout error:', err);
            res.status(500).json({ message: 'Failed to logout' });
        }
    });

    // Switch active branch endpoint
    router.post('/auth/switch-branch', authenticateToken, async (req, res) => {
        const { branch_id } = req.body;
        if (!branch_id) {
            return res.status(400).json({ message: 'Branch ID is required' });
        }

        try {
            const userId = req.user.id;

            // 1. Verify if user is Admin, or if they are assigned to this branch
            const userRoleNormalized = req.user.role; // already normalized by authenticateToken
            if (userRoleNormalized !== 'Admin') {
                const [assignment] = await pool.query(
                    'SELECT 1 FROM staff_branch_assignments WHERE staff_id = ? AND branch_id = ? LIMIT 1',
                    [userId, branch_id]
                );
                if (assignment.length === 0) {
                    return res.status(403).json({ message: 'Access denied. You are not assigned to this branch.' });
                }
            } else {
                // Admin can switch to any branch; verify it exists
                const [branch] = await pool.query(
                    'SELECT 1 FROM sarga_branches WHERE id = ? LIMIT 1',
                    [branch_id]
                );
                if (branch.length === 0) {
                    return res.status(404).json({ message: 'Branch not found' });
                }
            }

            // 2. Update user's active branch in the DB
            await pool.query(
                'UPDATE sarga_staff SET branch_id = ? WHERE id = ?',
                [branch_id, userId]
            );

            // 3. Fetch updated user details
            const [users] = await pool.query(
                `SELECT s.id, s.user_id, s.name, s.role, s.password, s.branch_id, s.is_first_login, s.image_url, s.settings, b.short_name AS branch_short_name 
                 FROM sarga_staff s 
                 LEFT JOIN sarga_branches b ON b.id = s.branch_id 
                 WHERE s.id = ? LIMIT 1`,
                [userId]
            );
            const user = users[0];
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // 4. Revoke current session token and issue a new one with the updated branch
            const authHeader = req.headers['authorization'];
            const oldToken = authHeader && authHeader.split(' ')[1];
            if (oldToken) {
                await revokeSessionInCache(oldToken);
                try {
                    await pool.query("UPDATE sarga_user_sessions SET is_revoked = 1 WHERE session_token = ?", [oldToken]);
                } catch (sessionErr) {
                    console.error('Old session revocation failed (non-fatal):', sessionErr.message);
                }
            }

            const { token, expiresIn } = await issueAccessToken(user, req);

            auditLog(user.id, 'BRANCH_SWITCH', `User ${user.user_id} switched active branch to ${branch_id}`);

            res.json({
                token,
                expiresIn,
                user: publicUser(user)
            });
        } catch (err) {
            console.error('Branch switch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};

