const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog, asyncHandler } = require('../helpers');

// Role-based module permissions (Administration → Permissions).
// Each row is an explicit override of the role's built-in (code) access for one module:
//   enabled = 0 → module switched OFF for the role
//   enabled = 1 → module granted to the role even though it is not in its built-in access
// Modules without a row use the defaults in client/src/config/rolePermissions.js.
// Admin is never configurable.

const CONFIGURABLE_ROLES = ['Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'];
const MODULE_KEY_RE = /^[a-z0-9_]{1,100}$/;

async function loadOverrides() {
    const [rows] = await pool.query('SELECT role, module_key, enabled FROM sarga_role_permissions');
    const overrides = {};
    for (const r of rows) {
        (overrides[r.role] ||= {})[r.module_key] = !!r.enabled;
    }
    return overrides;
}

// Any logged-in user: non-admins only receive their own role's overrides.
router.get('/role-permissions', authenticateToken, asyncHandler(async (req, res) => {
    const overrides = await loadOverrides();
    if (req.user.role === 'Admin') {
        return res.json({ overrides, roles: CONFIGURABLE_ROLES });
    }
    res.json({ overrides: { [req.user.role]: overrides[req.user.role] || {} } });
}));

// Admin: replace all overrides.
// Body: { overrides: { "Front Office": { "sales_quotes": false, "reports": true }, ... } }
router.put('/role-permissions', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const input = req.body?.overrides;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return res.status(400).json({ message: 'overrides must be an object keyed by role' });
    }

    const rows = [];
    for (const [role, modules] of Object.entries(input)) {
        if (!CONFIGURABLE_ROLES.includes(role)) {
            return res.status(400).json({ message: `Role "${role}" cannot be configured` });
        }
        if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
            return res.status(400).json({ message: `Modules for "${role}" must be an object` });
        }
        for (const [key, value] of Object.entries(modules)) {
            if (!MODULE_KEY_RE.test(key)) {
                return res.status(400).json({ message: `Invalid module key "${key}"` });
            }
            if (typeof value !== 'boolean') {
                return res.status(400).json({ message: `Value for "${key}" must be true or false` });
            }
            rows.push([role, key, value ? 1 : 0, req.user.id]);
        }
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM sarga_role_permissions');
        if (rows.length) {
            await connection.query(
                'INSERT INTO sarga_role_permissions (role, module_key, enabled, updated_by) VALUES ?',
                [rows]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }

    const summary = CONFIGURABLE_ROLES.map(r => {
        const vals = Object.values(input[r] || {});
        return `${r}: ${vals.filter(v => v).length} granted, ${vals.filter(v => !v).length} off`;
    }).join('; ');
    auditLog(req.user.id, 'ROLE_PERMISSIONS_UPDATED', `Updated role permissions (${summary})`);

    res.json({ message: 'Permissions saved', overrides: await loadOverrides() });
}));

module.exports = router;
