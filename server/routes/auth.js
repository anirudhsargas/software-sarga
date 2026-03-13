const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles, JWT_SECRET } = require('../middleware/auth');
const { normalizeMobile, auditLog } = require('../helpers');
const { validate, loginSchema, changePasswordSchema } = require('../middleware/validate');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 attempts per window
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = (upload) => {

    // Login
    router.post('/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
        const { user_id, password } = req.body;
        const normalizedUserId = normalizeMobile(user_id);
        
        console.log(`[LOGIN] Attempt: user_id=${user_id}, normalized=${normalizedUserId}`);

        if (normalizedUserId.length !== 10) {
            console.log(`[LOGIN] ❌ Invalid format: ${normalizedUserId}`);
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        try {
            const [users] = await pool.query("SELECT * FROM sarga_staff WHERE RIGHT(user_id, 10) = ?", [normalizedUserId]);
            const user = users[0];
            
            console.log(`[LOGIN] User query returned: ${users.length} user(s)`);
            if (user) {
                console.log(`[LOGIN] Found user: ID=${user.id}, Name=${user.name}, HasPassword=${!!user.password}, FirstLogin=${user.is_first_login}`);
            }

            if (!user) {
                console.log(`[LOGIN] ❌ User not found for mobile ${normalizedUserId}`);
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            let validPassword = await bcrypt.compare(password, user.password);
            console.log(`[LOGIN] bcrypt.compare result: ${validPassword}`);

            if (!validPassword && user.is_first_login) {
                console.log(`[LOGIN] Password didn't match, trying fallback checks (first_login=true)`);
                const normalizedPassword = normalizeMobile(password);
                console.log(`[LOGIN] Normalized password: "${normalizedPassword}" (length=${normalizedPassword.length})`);
                
                if (normalizedPassword.length === 10) {
                    validPassword = await bcrypt.compare(normalizedPassword, user.password);
                    console.log(`[LOGIN] Normalized password bcrypt result: ${validPassword}`);
                }

                if (!validPassword && /^\d{10}$/.test(password)) {
                    const candidates = [`+91${password}`, `91${password}`];
                    console.log(`[LOGIN] Trying +91 prefixes...`);
                    for (const candidate of candidates) {
                        if (await bcrypt.compare(candidate, user.password)) {
                            validPassword = true;
                            console.log(`[LOGIN] ✅ Matched with candidate: ${candidate}`);
                            break;
                        }
                    }
                }
            }
            
            if (!validPassword) {
                console.log(`[LOGIN] ❌ All password checks failed for user ${user.id}`);
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            
            console.log(`[LOGIN] ✅ Authentication successful for user ${user.id}`);

            const token = jwt.sign(
                { id: user.id, user_id: user.user_id, role: user.role, branch_id: user.branch_id },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            auditLog(user.id, 'LOGIN', `User ${user.user_id} logged in`);

            res.json({
                token,
                user: {
                    id: user.id,
                    user_id: user.user_id,
                    role: user.role,
                    name: user.name,
                    branch_id: user.branch_id || null,
                    image_url: user.image_url || null,
                    is_first_login: !!user.is_first_login
                }
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

            // Skip current password check only for first-login password reset
            if (!users[0].is_first_login) {
                const validCurrent = await bcrypt.compare(currentPassword, users[0].password);
                if (!validCurrent) return res.status(401).json({ message: 'Current password is incorrect' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 0 WHERE id = ?", [hashedPassword, userId]);

            auditLog(userId, 'PASSWORD_CHANGE', 'User changed their password');
            res.json({ message: 'Password updated successfully' });
        } catch (err) {
            res.status(500).json({ message: 'Error updating password' });
        }
    });

    // Get Current Staff Profile
    router.get('/staff/me', authenticateToken, async (req, res) => {
        try {
            const [rows] = await pool.query(
                "SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?",
                [req.user.id]
            );
            if (!rows[0]) return res.status(404).json({ message: 'User not found' });
            res.json(rows[0]);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Current Staff Profile
    router.put('/staff/me', authenticateToken, upload.single('image'), async (req, res) => {
        const { name } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

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
                "SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?",
                [req.user.id]
            );
            auditLog(req.user.id, 'PROFILE_UPDATE', 'Updated profile details');
            res.json(rows[0]);
        } catch (err) {
            console.error('Profile fetch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};

