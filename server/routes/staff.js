const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getUserBranchId, auditLog, normalizeMobileWithCountry } = require('../helpers');
const { attachNormalizedMobile } = require('../middleware/phone');
const bcrypt = require('bcryptjs');
const { validate, addStaffSchema, staffSalaryUpdateSchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../helpers/cloudinaryUpload');

module.exports = (upload, removeUploadFile) => {
    const router = require('express').Router();

    // --- STAFF ROUTES (Admin Only) ---

    // Add Staff
    router.post('/', authenticateToken, authorizeRoles('Admin'), upload.single('image'), validate(addStaffSchema), attachNormalizedMobile('mobile', 'countryCode'), async (req, res) => {
        const { mobile, countryCode, name, role, branch_id } = req.body;
        let imageUrl = null;

        // Upload to Cloudinary if file is present
        if (req.file) {
            try {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'staff');
                imageUrl = cloudinaryResult.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
        }

        // Normalize using optional countryCode hint
        const normalizedMobile = normalizeMobileWithCountry(mobile, countryCode);
        if (!normalizedMobile || (!(normalizedMobile.startsWith('+') || normalizedMobile.length === 10))) {
            return res.status(400).json({ message: 'Invalid mobile number' });
        }

        try {
            const hashedPassword = await bcrypt.hash(normalizedMobile, 10);
            const [result] = await pool.query(
                "INSERT INTO sarga_staff (user_id, password, role, name, is_first_login, branch_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [normalizedMobile, hashedPassword, role, name, 1, branch_id || null, imageUrl]
            );

            auditLog(req.user.id, 'STAFF_ADD', `Added staff ${normalizedMobile} as ${role} for branch ${branch_id}`);
            res.status(201).json({ id: result.insertId, message: 'Staff added successfully' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'User ID already exists' });
            res.status(500).json({ message: 'Database error' });
        }
    });

    // List Staff
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

            let where = "WHERE s.role != 'Admin'";
            const params = [];

            if (req.user.role !== 'Admin' && req.query.all !== 'true') {
                const branchId = await getUserBranchId(req.user.id);
                where += ' AND s.branch_id = ?';
                params.push(branchId);
            } else if (req.query.branch_id) {
                where += ' AND s.branch_id = ?';
                params.push(req.query.branch_id);
            }

            const select = `SELECT s.id, s.user_id, s.name, s.role, s.is_first_login, s.created_at, s.branch_id, s.image_url, s.salary_type, s.base_salary, s.daily_rate, s.settings, b.name as branch_name`;
            const baseFrom = `FROM sarga_staff s LEFT JOIN sarga_branches b ON s.branch_id = b.id ${where}`;

            const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
            const [rows] = await pool.query(`${select} ${baseFrom} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
            
            res.json(response(rows, total));
        } catch (err) {
            console.error('List staff error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Update Staff
    router.put('/:id', authenticateToken, upload.single('image'), validate(staffSalaryUpdateSchema), async (req, res) => {
        let { id } = req.params;
        if (id === 'me') id = req.user.id;

        // Authorization: Admin or Self (for profile updates only)
        if (req.user.role !== 'Admin' && req.user.id != id) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }

        const { mobile, name, role, branch_id, salary_type, base_salary, daily_rate } = req.body;
        let imageUrl = null;

        // Upload to Cloudinary if file is present
        if (req.file) {
            try {
                const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'staff');
                imageUrl = cloudinaryResult.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
                return res.status(500).json({ message: 'Failed to upload image' });
            }
        }

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
            } catch (_err) {
                return res.status(500).json({ message: 'Database error' });
            }
        }

        // Admin/Accountant can update everything
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
                if (req.body.settings !== undefined) {
                    updates.push("settings = ?");
                    values.push(JSON.stringify(req.body.settings));
                }

                values.push(id);
                await pool.query(`UPDATE sarga_staff SET ${updates.join(', ')} WHERE id = ?`, values);

                const [rows] = await pool.query("SELECT id, user_id, name, role, branch_id, image_url, salary_type, base_salary, daily_rate, settings FROM sarga_staff WHERE id = ?", [id]);
                return res.json(rows[0]);
            } catch (_err) {
                return res.status(500).json({ message: 'Database error' });
            }
        }

        // Full update with mobile (user_id change)
        // Normalize using optional countryCode if provided
        const normalizedMobile = normalizeMobileWithCountry(mobile, req.body?.countryCode);
        if (!normalizedMobile || (!(normalizedMobile.startsWith('+') || normalizedMobile.length === 10))) {
            return res.status(400).json({ message: 'Invalid mobile number' });
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
            // C-02: Check for linked records before deletion
            const [assignments] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_job_staff_assignments WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);
            
            const [salaryRecords] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_staff_salary WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);

            const [salaryPayments] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_staff_salary_payments WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);
            
            const [attendance] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_staff_attendance WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);

            const [leaveBalances] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_staff_leave_balance WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);

            const [expensePayments] = await pool.query(
                "SELECT COUNT(*) as cnt FROM sarga_payments WHERE staff_id = ?", [id]
            ).catch(() => [[{ cnt: 0 }]]);

            const linked = [];
            if (assignments[0].cnt > 0) linked.push(`${assignments[0].cnt} job assignment(s)`);
            if (salaryRecords[0].cnt > 0) linked.push(`${salaryRecords[0].cnt} salary record(s)`);
            if (salaryPayments[0].cnt > 0) linked.push(`${salaryPayments[0].cnt} salary payment transaction(s)`);
            if (attendance[0].cnt > 0) linked.push(`${attendance[0].cnt} attendance record(s)`);
            if (leaveBalances[0].cnt > 0) linked.push(`${leaveBalances[0].cnt} leave balance record(s)`);
            if (expensePayments[0].cnt > 0) linked.push(`${expensePayments[0].cnt} payment ledger entry(ies)`);

            if (linked.length > 0) {
                return res.status(409).json({ message: `Cannot delete: staff has ${linked.join(', ')}. Deactivate instead.` });
            }

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
            // Delete from Cloudinary if it's a Cloudinary URL
            if (imageUrl && imageUrl.includes('cloudinary.com')) {
                try {
                    // Extract public_id from Cloudinary URL
                    const publicId = imageUrl.split('/').slice(-1)[0].split('.')[0];
                    await deleteFromCloudinary(`staff/${publicId}`);
                } catch (deleteError) {
                    console.error('Cloudinary delete error:', deleteError);
                }
            } else if (imageUrl) {
                // Fallback to local file deletion for existing files
                await removeUploadFile(imageUrl);
            }

            await pool.query("UPDATE sarga_staff SET image_url = NULL WHERE id = ?", [id]);
            res.json({ message: 'Staff image removed', image_url: null });
        } catch (err) {
            console.error('Remove staff image error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // ─── Multi-Branch Staff Assignment ───

    // GET /staff/:id/branches - Get all branch assignments for a staff member
    router.get('/:id/branches', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id } = req.params;
        try {
            const [assignments] = await pool.query(`
                SELECT sba.*, b.name as branch_name, b.short_name
                FROM staff_branch_assignments sba
                JOIN sarga_branches b ON sba.branch_id = b.id
                WHERE sba.staff_id = ?
                ORDER BY sba.is_primary DESC, b.name ASC
            `, [id]);
            res.json(assignments);
        } catch (err) {
            console.error('Fetch branch assignments error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // POST /staff/:id/branches - Assign a branch to a staff member
    router.post('/:id/branches', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id } = req.params;
        const { branch_id, is_primary, permissions } = req.body;
        if (!branch_id) return res.status(400).json({ message: 'branch_id is required' });
        try {
            // If setting as primary, unset any existing primary first
            if (is_primary) {
                await pool.query('UPDATE staff_branch_assignments SET is_primary = 0 WHERE staff_id = ?', [id]);
            }
            const permissionsJson = permissions ? JSON.stringify(permissions) : null;
            await pool.query(`
                INSERT INTO staff_branch_assignments (staff_id, branch_id, is_primary, permissions, assigned_by)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary), permissions = VALUES(permissions), assigned_by = VALUES(assigned_by)
            `, [id, branch_id, is_primary ? 1 : 0, permissionsJson, req.user.id]);
            // Also update the primary branch_id on sarga_staff if this is primary
            if (is_primary) {
                await pool.query('UPDATE sarga_staff SET branch_id = ? WHERE id = ?', [branch_id, id]);
            }
            auditLog(req.user.id, 'STAFF_BRANCH_ASSIGN', `Assigned staff ${id} to branch ${branch_id}`);
            res.status(201).json({ message: 'Branch assigned successfully' });
        } catch (err) {
            console.error('Assign branch error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // PUT /staff/:id/branches/:assignmentId - Update branch assignment
    router.put('/:id/branches/:assignmentId', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id, assignmentId } = req.params;
        const { is_primary, permissions } = req.body;
        try {
            if (is_primary) {
                await pool.query('UPDATE staff_branch_assignments SET is_primary = 0 WHERE staff_id = ?', [id]);
            }
            const permissionsJson = permissions ? JSON.stringify(permissions) : null;
            await pool.query('UPDATE staff_branch_assignments SET is_primary = ?, permissions = ? WHERE id = ? AND staff_id = ?',
                [is_primary ? 1 : 0, permissionsJson, assignmentId, id]);
            // Update sarga_staff.branch_id if primary changed
            if (is_primary) {
                const [[assignment]] = await pool.query('SELECT branch_id FROM staff_branch_assignments WHERE id = ?', [assignmentId]);
                if (assignment) {
                    await pool.query('UPDATE sarga_staff SET branch_id = ? WHERE id = ?', [assignment.branch_id, id]);
                }
            }
            auditLog(req.user.id, 'STAFF_BRANCH_UPDATE', `Updated branch assignment ${assignmentId} for staff ${id}`);
            res.json({ message: 'Branch assignment updated' });
        } catch (err) {
            console.error('Update branch assignment error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // DELETE /staff/:id/branches/:assignmentId - Remove branch assignment
    router.delete('/:id/branches/:assignmentId', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id, assignmentId } = req.params;
        try {
            const [[assignment]] = await pool.query('SELECT branch_id, is_primary FROM staff_branch_assignments WHERE id = ? AND staff_id = ?', [assignmentId, id]);
            if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
            await pool.query('DELETE FROM staff_branch_assignments WHERE id = ? AND staff_id = ?', [assignmentId, id]);
            // If removed assignment was primary, assign a new primary or clear branch_id
            if (assignment.is_primary) {
                const [[nextPrimary]] = await pool.query('SELECT branch_id FROM staff_branch_assignments WHERE staff_id = ? LIMIT 1', [id]);
                if (nextPrimary) {
                    await pool.query('UPDATE staff_branch_assignments SET is_primary = 1 WHERE staff_id = ? AND branch_id = ?', [id, nextPrimary.branch_id]);
                    await pool.query('UPDATE sarga_staff SET branch_id = ? WHERE id = ?', [nextPrimary.branch_id, id]);
                } else {
                    await pool.query('UPDATE sarga_staff SET branch_id = NULL WHERE id = ?', [id]);
                }
            }
            auditLog(req.user.id, 'STAFF_BRANCH_REMOVE', `Removed branch assignment ${assignmentId} for staff ${id}`);
            res.json({ message: 'Branch assignment removed' });
        } catch (err) {
            console.error('Remove branch assignment error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // GET /staff/:id/assigned-branches - Simplified list of branch IDs for current user
    router.get('/my-branches', authenticateToken, async (req, res) => {
        try {
            const [assignments] = await pool.query(`
                SELECT sba.branch_id, b.name as branch_name, sba.is_primary
                FROM staff_branch_assignments sba
                JOIN sarga_branches b ON sba.branch_id = b.id
                WHERE sba.staff_id = ?
                ORDER BY sba.is_primary DESC, b.name ASC
            `, [req.user.id]);
            // Always include the user's primary branch
            const primaryBranch = assignments.find(a => a.is_primary);
            if (!primaryBranch && req.user.branch_id) {
                assignments.unshift({ branch_id: req.user.branch_id, branch_name: '', is_primary: 1 });
            }
            res.json(assignments);
        } catch (err) {
            console.error('Fetch my branches error:', err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    // Reset Staff Password (to their mobile/user_id@Sarga)
    router.put('/:id/reset-password', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
        const { id } = req.params;

        try {
            const [users] = await pool.query("SELECT user_id, name FROM sarga_staff WHERE id = ?", [id]);
            if (!users[0]) return res.status(404).json({ message: 'Staff member not found' });

            const normalizedMobile = normalizeMobileWithCountry(users[0].user_id);
            const passwordWithSuffix = `${normalizedMobile}@Sarga`;
            const newHashedPassword = await bcrypt.hash(passwordWithSuffix, 10);
            await pool.query("UPDATE sarga_staff SET password = ?, is_first_login = 1 WHERE id = ?", [newHashedPassword, id]);

            auditLog(req.user.id, 'STAFF_PASSWORD_RESET', `Reset password for staff member ${users[0].name} (${id}) to [REDACTED]`);
            res.json({ message: `Password reset to ${normalizedMobile}@Sarga successfully. Staff must change password on first login.` });
        } catch (err) {
            console.error("Reset password error:", err);
            res.status(500).json({ message: 'Database error' });
        }
    });

    return router;
};

