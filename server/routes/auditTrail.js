const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const logger = require('../helpers/logger');

const sanitizeFilter = (value) => {
    if (!value || value === '' || value === 'all') return null;
    return value;
};

const buildWhereClause = (query) => {
    const conditions = [];
    const params = [];
    const {
        search, user_id, branch_id, module, action,
        status, record_id, document_number,
        date_from, date_to, staff_id, action_type, success
    } = query;

    if (search) {
        conditions.push('(a.username LIKE ? OR a.employee_name LIKE ? OR a.document_number LIKE ? OR a.module LIKE ? OR a.record_id LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s, s, s);
    }

    const uid = sanitizeFilter(user_id);
    if (uid) { conditions.push('a.user_id_internal = ?'); params.push(uid); }

    const bid = sanitizeFilter(branch_id);
    if (bid) { conditions.push('a.branch_id = ?'); params.push(bid); }

    const mod = sanitizeFilter(module);
    if (mod) { conditions.push('a.module = ?'); params.push(mod); }

    const act = sanitizeFilter(action);
    if (act) { conditions.push('a.action_type = ?'); params.push(act); }

    const actType = sanitizeFilter(action_type);
    if (actType) { conditions.push('a.action_type = ?'); params.push(actType); }

    const st = sanitizeFilter(status);
    if (st === 'success') { conditions.push('a.success = 1'); }
    else if (st === 'failed') { conditions.push('a.success = 0'); }

    const suc = sanitizeFilter(success);
    if (suc === '1' || suc === 'true') { conditions.push('a.success = 1'); }
    else if (suc === '0' || suc === 'false') { conditions.push('a.success = 0'); }

    const rid = sanitizeFilter(record_id);
    if (rid) { conditions.push('a.record_id = ?'); params.push(rid); }

    const dn = sanitizeFilter(document_number);
    if (dn) { conditions.push('a.document_number LIKE ?'); params.push(`%${dn}%`); }

    const sid = sanitizeFilter(staff_id);
    if (sid) { conditions.push('a.user_id_internal = ?'); params.push(sid); }

    if (date_from) { conditions.push('a.timestamp >= ?'); params.push(date_from); }
    if (date_to) { conditions.push('a.timestamp <= ?'); params.push(date_to + ' 23:59:59'); }

    return { where: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '', params };
};

router.get('/audit/logs', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { where, params } = buildWhereClause(req.query);

    const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM sarga_enterprise_audit a ${where}`, params
    );
    const total = countResult[0][0]?.total || 0;

    const dataResult = await pool.query(
        `SELECT a.* FROM sarga_enterprise_audit a ${where} ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
    );

    res.json({
        success: true,
        data: dataResult[0],
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
        }
    });
}));

router.get('/audit/logs/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        'SELECT * FROM sarga_enterprise_audit WHERE id = ? OR audit_id = ? LIMIT 1',
        [req.params.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Audit record not found' });
    res.json({ success: true, data: rows[0] });
}));

router.get('/audit/stats', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { date_from, date_to, branch_id } = req.query;
    const conditions = [];
    const params = [];

    if (date_from) { conditions.push('a.timestamp >= ?'); params.push(date_from); }
    if (date_to) { conditions.push('a.timestamp <= ?'); params.push(date_to + ' 23:59:59'); }
    if (branch_id) { conditions.push('a.branch_id = ?'); params.push(branch_id); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const today = new Date().toISOString().slice(0, 10);

    const [
        [totalToday],
        [loginCount],
        [failedLogins],
        [creates],
        [updates],
        [deletes],
        [approvals],
        [moduleStats],
        [userStats],
        [hourlyActivity],
        [branchActivity],
        [errorOps],
    ] = await Promise.all([
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Login' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.success = 0 AND a.action_type = 'Login' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Create' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Update' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Delete' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type IN ('Approve','Reject') AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today]),
        pool.query(`
            SELECT a.module, COUNT(*) as count
            FROM sarga_enterprise_audit a ${where}
            GROUP BY a.module ORDER BY count DESC LIMIT 10`, params),
        pool.query(`
            SELECT a.user_id_internal, a.username, a.employee_name, COUNT(*) as count
            FROM sarga_enterprise_audit a ${where}
            GROUP BY a.user_id_internal, a.username, a.employee_name
            ORDER BY count DESC LIMIT 10`, params),
        pool.query(`
            SELECT DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:00') as hour, COUNT(*) as count
            FROM sarga_enterprise_audit a ${where}
            GROUP BY hour ORDER BY hour`, params),
        pool.query(`
            SELECT COALESCE(a.branch_name, 'Unknown') as branch, COUNT(*) as count
            FROM sarga_enterprise_audit a ${where}
            GROUP BY a.branch_name ORDER BY count DESC`, params),
        pool.query(`
            SELECT a.module, a.action_type, a.error_message, COUNT(*) as count
            FROM sarga_enterprise_audit a WHERE a.success = 0 ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
            GROUP BY a.module, a.action_type, a.error_message
            ORDER BY count DESC LIMIT 10`, params),
    ]);

    res.json({
        success: true,
        data: {
            totalToday: totalToday[0]?.count || 0,
            totalLogins: loginCount[0]?.count || 0,
            failedLogins: failedLogins[0]?.count || 0,
            recordsCreated: creates[0]?.count || 0,
            recordsUpdated: updates[0]?.count || 0,
            recordsDeleted: deletes[0]?.count || 0,
            approvals: approvals[0]?.count || 0,
            mostActiveModules: moduleStats[0] || [],
            mostActiveUsers: userStats[0] || [],
            hourlyActivity: hourlyActivity[0] || [],
            branchActivity: branchActivity[0] || [],
            topErrors: errorOps[0] || [],
        }
    });
}));

router.get('/audit/filters', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const [modules] = await pool.query(
        'SELECT DISTINCT module FROM sarga_enterprise_audit ORDER BY module'
    );
    const [actions] = await pool.query(
        'SELECT DISTINCT action_type FROM sarga_enterprise_audit ORDER BY action_type'
    );
    const [users] = await pool.query(`
        SELECT DISTINCT a.user_id_internal, a.username, a.employee_name
        FROM sarga_enterprise_audit a WHERE a.user_id_internal IS NOT NULL
        ORDER BY a.employee_name
    `);
    const [branches] = await pool.query(`
        SELECT DISTINCT a.branch_id, a.branch_name
        FROM sarga_enterprise_audit a WHERE a.branch_id IS NOT NULL
        ORDER BY a.branch_name
    `);

    res.json({
        success: true,
        data: {
            modules: modules[0].map(m => m.module).filter(Boolean),
            actions: actions[0].map(a => a.action_type).filter(Boolean),
            users: users[0] || [],
            branches: branches[0] || [],
        }
    });
}));

router.get('/audit/export', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { format = 'json', date_from, date_to, user_id, branch_id, module, action, status } = req.query;
    const { where, params } = buildWhereClause(req.query);

    const [rows] = await pool.query(
        `SELECT a.* FROM sarga_enterprise_audit a ${where} ORDER BY a.timestamp DESC`,
        params
    );

    const data = rows[0] || [];

    const exportData = data.map(r => ({
        audit_id: r.audit_id,
        timestamp: r.timestamp,
        username: r.username,
        employee_name: r.employee_name,
        user_role: r.user_role,
        branch_name: r.branch_name,
        department: r.department,
        module: r.module,
        action_type: r.action_type,
        record_type: r.record_type,
        record_id: r.record_id,
        document_number: r.document_number,
        ip_address: r.ip_address,
        device_name: r.device_name,
        browser: r.browser,
        operating_system: r.operating_system,
        response_status: r.response_status,
        success: r.success ? 'Yes' : 'No',
        error_message: r.error_message,
        reason_remarks: r.reason_remarks,
        duration_ms: r.duration_ms,
        current_hash: r.current_hash,
        previous_hash: r.previous_hash,
    }));

    const generatedAt = new Date().toISOString();
    const filters = { date_from, date_to, user_id, branch_id, module, action, status };
    const appliedFilters = Object.entries(filters).filter(([, v]) => v && v !== 'all').reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

    if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=audit-log-${new Date().toISOString().slice(0, 10)}.json`);
        return res.json({
            generatedAt,
            generatedBy: req.user?.user_id || 'Unknown',
            filters: appliedFilters,
            totalRecords: exportData.length,
            data: exportData,
        });
    }

    if (format === 'csv') {
        const headers = ['Audit ID', 'Timestamp', 'Username', 'Employee Name', 'Role', 'Branch', 'Department', 'Module', 'Action', 'Record Type', 'Record ID', 'Document No', 'IP Address', 'Device', 'Browser', 'OS', 'Status', 'Response Status', 'Error', 'Remarks', 'Duration (ms)', 'Hash'];
        const csvRows = [headers.join(',')];
        for (const r of exportData) {
            const row = headers.map(h => {
                const key = h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, '');
                const val = r[key] || '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(row.join(','));
        }
        csvRows.unshift(`# Generated: ${generatedAt}, Generated by: ${req.user?.user_id || 'Unknown'}, Filters: ${JSON.stringify(appliedFilters)}, Total: ${exportData.length}`);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
        return res.send(csvRows.join('\n'));
    }

    res.json({ success: true, data: exportData });
}));

router.get('/audit/verify-chain', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    const { start_id, end_id, limit = 100 } = req.query;
    let conditions = [];
    let params = [];

    if (start_id) { conditions.push('id >= ?'); params.push(start_id); }
    if (end_id) { conditions.push('id <= ?'); params.push(end_id); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await pool.query(
        `SELECT id, audit_id, timestamp, previous_hash, current_hash FROM sarga_enterprise_audit ${where} ORDER BY id ASC LIMIT ?`,
        [...params, parseInt(limit)]
    );

    const data = rows[0] || [];
    const violations = [];

    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        if (curr.previous_hash !== prev.current_hash) {
            violations.push({
                index: i,
                id: curr.id,
                auditId: curr.audit_id,
                expectedPreviousHash: prev.current_hash,
                actualPreviousHash: curr.previous_hash,
            });
        }
    }

    res.json({
        success: true,
        data: {
            recordsChecked: data.length,
            chainIntact: violations.length === 0,
            violations,
            firstRecord: data[0] || null,
            lastRecord: data[data.length - 1] || null,
        }
    });
}));

module.exports = router;
