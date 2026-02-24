const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, normalizeMobile } = require('../helpers');
const bcrypt = require('bcryptjs');
const { validate, addStaffSchema } = require('../middleware/validate');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

module.exports = (upload, removeUploadFile) => {
    const router = require('express').Router();

    // --- STAFF ROUTES (Admin Only) ---

    // Add Staff
    router.post('/', authenticateToken, authorizeRoles('Admin'), upload.single('image'), validate(addStaffSchema), async (req, res) => {
        const { mobile, name, role, branch_id } = req.body;
        const normalizedMobile = normalizeMobile(mobile);
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (normalizedMobile.length !== 10) {
            return res.status(400).json({ message: 'Mobile number must be 10 digits' });
        }

        try {
            const hashedPassword = await bcrypt.hash(normalizedMobile, 10);
            const [result] = await pool.query(
                "INSERT INTO sarga_staff (user_id, password, role, name, is_first_login, branch_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [normalizedMobile, hashedPassword, role, name, 1, branch_id || null, imageUrl]
            );

            auditLog(req.user.id, 'STAFF_ADD', `Added staff ${mobile} as ${role} for branch ${branch_id}`);
            res.status(201).json({ id: result.insertId, message: 'Staff added successfully' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User ID already exists' });
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Staff
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const { page, limit, offset } = parsePagination(req);
            const usePagination = !!req.query.page;

            let where = "WHERE s.role != 'Admin'";
            const params = [];

            if (req.user.role !== 'Admin') {
                const branchId = await getUserBranchId(req.user.id);
                where += ' AND s.branch_id = ?';
                params.push(branchId);
            } else if (req.query.branch_id) {
                // Allow Admin to filter by branch via query parameter
                where += ' AND s.branch_id = ?';
                params.push(req.query.branch_id);
            }

            const select = `SELECT s.id, s.user_id, s.name, s.role, s.is_first_login, s.created_at, s.branch_id, s.image_url, s.salary_type, s.base_salary, s.daily_rate, b.name as branch_name`;
            const baseFrom = `FROM sarga_staff s LEFT JOIN sarga_branches b ON s.branch_id = b.id ${where}`;

            if (usePagination) {
                const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt ${baseFrom}`, params);
                const [rows] = await pool.query(`${select} ${baseFrom} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
                return res.json(paginatedResponse(rows, cnt, page, limit));
            }

            const [rows] = await pool.query(`${select} ${baseFrom} ORDER BY s.created_at DESC`, params);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Staff
    router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
        let { id } = req.params;
        if (id === 'me') id = req.user.id;

        // Authorization: Admin or Self (for profile updates only)
        if (req.user.role !== 'Admin' && req.user.id != id) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }

        const { mobile, name, role, branch_id, salary_type, base_salary, daily_rate } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        // Non-Admin users can ONLY update their own name and image (profile updates)
        // They CANNOT change mobile, role, or branch_id
        if (req.user.role !== 'Admin') {
            if (mobile || role || branch_id) {
                return res.status(403).json({ message: 'Only Admin can modify user ID, role, or branch assignment.' });
            }

            // Profile update only (name and/or image)
            if (!name && !imageUrl) {
                return res.status(400).json({ message: 'No changes provided' });
            }

            try {
                if (name && imageUrl) {
                    await pool.query("UPDATE sarga_staff SET name = ?, image_url = ? WHERE id = ?", [name, imageUrl, id]);
                } else if (name) {
                    await pool.query("UPDATE sarga_staff SET name = ? WHERE id = ?", [name, id]);
                } else if (imageUrl) {
                    await pool.query("UPDATE sarga_staff SET image_url = ? WHERE id = ?", [imageUrl, id]);
                }
                // Return updated info
                const [rows] = await pool.query("SELECT id, user_id, name, role, branch_id, image_url FROM sarga_staff WHERE id = ?", [id]);
                return res.json(rows[0]);
            } catch (err) {
                return res.status(500).json({ message: 'Database error' });
            }
        }

        // Admin can update everything
        // If mobile is NOT provided, it's a partial update (name/image/role/branch/salary only)
        if (!mobile) {
            if (!name && !imageUrl && !role && !branch_id && !salary_type) {
                return res.status(400).json({ message: 'No changes provided' });
            }
            try {
                const updates = [];
                const values = [];

                if (name) {
                    updates.push("name = ?");
                    values.push(name);
                }
                if (imageUrl) {
                    updates.push("image_url = ?");
                    values.push(imageUrl);
                }
                if (role) {
                    updates.push("role = ?");
                    values.push(role);
                }
                if (branch_id !== undefined) {
                    updates.push("branch_id = ?");
                    values.push(branch_id || null);
                }
                if (salary_type) {
                    updates.push("salary_type = ?");
                    values.push(salary_type);
                }
                if (salary_type === 'Monthly' && base_salary !== undefined) {
                    updates.push("base_salary = ?");
                    values.push(base_salary || 0);
                    // Clear daily_rate when switching to monthly or updating monthly
                    updates.push("daily_rate = NULL");
                }
                if (salary_type === 'Daily' && daily_rate !== undefined) {
                    updates.push("daily_rate = ?");
                    values.push(daily_rate || 0);
                    // Clear base_salary when switching to daily or updating daily
                    updates.push("base_salary = NULL");
                }

                values.push(id);
                await pool.query(`UPDATE sarga_staff SET ${updates.join(', ')} WHERE id = ?`, values);

                const [rows] = await pool.query("SELECT id, user_id, name, role, branch_id, image_url, salary_type, base_salary, daily_rate FROM sarga_staff WHERE id = ?", [id]);
                return res.json(rows[0]);
            } catch (err) {
                return res.status(500).json({ message: 'Database error' });
            }
        }

        // Full update with mobile (user_id change)
        const normalizedMobile = normalizeMobile(mobile);

        if (normalizedMobile.length !== 10) {
            return res.status(400).json({ message: 'Mobile number must be 10 digits' });
        }

        try {
            let query, params;

            if (imageUrl) {
                query = "UPDATE sarga_staff SET user_id = ?, name = ?, role = ?, branch_id = ?, image_url = ?";
                params = [normalizedMobile, name, role, branch_id || null, imageUrl];
            } else {
                query = "UPDATE sarga_staff SET user_id = ?, name = ?, role = ?, branch_id = ?";
                params = [normalizedMobile, name, role, branch_id || null];
            }

            // Add salary fields if provided
            if (salary_type) {
                query += ", salary_type = ?";
                params.push(salary_type);
            }
            if (salary_type === 'Monthly' && base_salary !== undefined) {
                query += ", base_salary = ?, daily_rate = NULL";
                params.push(base_salary || 0);
            }
            if (salary_type === 'Daily' && daily_rate !== undefined) {
                query += ", daily_rate = ?, base_salary = NULL";
                params.push(daily_rate || 0);
            }

            query += " WHERE id = ?";
            params.push(id);

            await pool.query(query, params);
            auditLog(req.user.id, 'STAFF_UPDATE', `Updated staff member ${id}: ${name} (${role})`);
            res.json({ message: 'Staff member updated successfully' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User ID already exists' });
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Staff
    router.delete('/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id } = req.params;

        try {
            await pool.query("DELETE FROM sarga_staff WHERE id = ?", [id]);
            auditLog(req.user.id, 'STAFF_DELETE', `Deleted staff member ID: ${id}`);
            res.json({ message: 'Staff member deleted successfully' });
        } catch (err) {
            console.error("Delete staff error:", err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Delete Staff Image
    router.delete('/:id/image', authenticateToken, async (req, res) => {
        let { id } = req.params;
        if (id === 'me') id = req.user.id;

        if (req.user.role !== 'Admin' && req.user.id != id) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }

        try {
            const [rows] = await pool.query("SELECT image_url FROM sarga_staff WHERE id = ?", [id]);
            if (!rows[0]) return res.status(404).json({ message: 'Staff member not found' });

            const imageUrl = rows[0].image_url;
            if (imageUrl) await removeUploadFile(imageUrl);

            await pool.query("UPDATE sarga_staff SET image_url = NULL WHERE id = ?", [id]);
            res.json({ message: 'Staff image removed', image_url: null });
        } catch (err) {
            console.error('Remove staff image error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Reset Staff Password (to their mobile/user_id)
    router.put('/:id/reset-password', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id } = req.params;

        try {
            const [users] = await pool.query("SELECT user_id FROM sarga_staff WHERE id = ?", [id]);
            if (!users[0]) return res.status(404).json({ message: 'Staff member not found' });

            const normalizedMobile = normalizeMobile(users[0].user_id);
            const newHashedPassword = await bcrypt.hash(normalizedMobile, 10);
            await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 1 WHERE id = ?", [newHashedPassword, id]);

            auditLog(req.user.id, 'STAFF_PASSWORD_RESET', `Reset password for staff member ${id}`);
            res.json({ message: 'Password reset to mobile number successfully' });
        } catch (err) {
            console.error("Reset password error:", err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};
