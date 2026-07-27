const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const logger = require('../helpers/logger');

const TABLE_EXISTS_CACHE = { checked: false, exists: false };

const safeAuditQuery = async (sql, params, defaultResult) => {
    try {
        const result = await pool.query(sql, params);
        return result;
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE' || (err.errno === 1146)) {
            if (!TABLE_EXISTS_CACHE.checked) {
                TABLE_EXISTS_CACHE.exists = false;
                TABLE_EXISTS_CACHE.checked = true;
                logger.warn('[Audit] sarga_enterprise_audit table not found - returning empty results');
            }
            return defaultResult;
        }
        throw err;
    }
};

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

    if (!TABLE_EXISTS_CACHE.checked) {
        try {
            await pool.query('SELECT 1 FROM sarga_enterprise_audit LIMIT 1');
            TABLE_EXISTS_CACHE.exists = true;
        } catch { TABLE_EXISTS_CACHE.exists = false; }
        TABLE_EXISTS_CACHE.checked = true;
    }

    if (!TABLE_EXISTS_CACHE.exists) {
        return res.json({ success: true, data: [], pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 } });
    }

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
    if (!TABLE_EXISTS_CACHE.exists) {
        return res.status(404).json({ message: 'Audit table not initialized' });
    }
    const [rows] = await pool.query(
        'SELECT * FROM sarga_enterprise_audit WHERE id = ? OR audit_id = ? LIMIT 1',
        [req.params.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Audit record not found' });
    res.json({ success: true, data: rows[0] });
}));

router.get('/audit/stats', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req, res) => {
    if (!TABLE_EXISTS_CACHE.checked) {
        try {
            await pool.query('SELECT 1 FROM sarga_enterprise_audit LIMIT 1');
            TABLE_EXISTS_CACHE.exists = true;
        } catch { TABLE_EXISTS_CACHE.exists = false; }
        TABLE_EXISTS_CACHE.checked = true;
    }

    if (!TABLE_EXISTS_CACHE.exists) {
        return res.json({
            success: true,
            data: {
                totalToday: 0, totalLogins: 0, failedLogins: 0,
                recordsCreated: 0, recordsUpdated: 0, recordsDeleted: 0, approvals: 0,
                mostActiveModules: [], mostActiveUsers: [],
                hourlyActivity: [], branchActivity: [], topErrors: [],
            }
        });
    }

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
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Login' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.success = 0 AND a.action_type = 'Login' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Create' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Update' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type = 'Delete' AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.action_type IN ('Approve','Reject') AND DATE(a.created_at) = ? ${branch_id ? 'AND a.branch_id = ?' : ''}`,
            branch_id ? [today, branch_id] : [today], [[{ count: 0 }]]),
        safeAuditQuery(`SELECT a.module, COUNT(*) as count FROM sarga_enterprise_audit a ${where} GROUP BY a.module ORDER BY count DESC LIMIT 10`,
            params, [[{ module: 'N/A', count: 0 }]]),
        safeAuditQuery(`SELECT a.user_id_internal, a.username, a.employee_name, COUNT(*) as count FROM sarga_enterprise_audit a ${where} GROUP BY a.user_id_internal, a.username, a.employee_name ORDER BY count DESC LIMIT 10`,
            params, [[{ user_id_internal: null, username: null, employee_name: null, count: 0 }]]),
        safeAuditQuery(`SELECT DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:00') as hour, COUNT(*) as count FROM sarga_enterprise_audit a ${where} GROUP BY hour ORDER BY hour`,
            params, [[{ hour: null, count: 0 }]]),
        safeAuditQuery(`SELECT COALESCE(a.branch_name, 'Unknown') as branch, COUNT(*) as count FROM sarga_enterprise_audit a ${where} GROUP BY a.branch_name ORDER BY count DESC`,
            params, [[{ branch: 'N/A', count: 0 }]]),
        safeAuditQuery(`SELECT a.module, a.action_type, a.error_message, COUNT(*) as count FROM sarga_enterprise_audit a WHERE a.success = 0 ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''} GROUP BY a.module, a.action_type, a.error_message ORDER BY count DESC LIMIT 10`,
            params, [[{ module: 'N/A', action_type: 'N/A', error_message: null, count: 0 }]]),
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
    const modules = await safeAuditQuery(
        'SELECT DISTINCT module FROM sarga_enterprise_audit ORDER BY module', [],
        [[{ module: null }]]
    );
    const actions = await safeAuditQuery(
        'SELECT DISTINCT action_type FROM sarga_enterprise_audit ORDER BY action_type', [],
        [[{ action_type: null }]]
    );
    const users = await safeAuditQuery(
        `SELECT DISTINCT a.user_id_internal, a.username, a.employee_name
         FROM sarga_enterprise_audit a WHERE a.user_id_internal IS NOT NULL
         ORDER BY a.employee_name`, [],
        [[{ user_id_internal: null, username: null, employee_name: null }]]
    );
    const branches = await safeAuditQuery(
        `SELECT DISTINCT a.branch_id, a.branch_name
         FROM sarga_enterprise_audit a WHERE a.branch_id IS NOT NULL
         ORDER BY a.branch_name`, [],
        [[{ branch_id: null, branch_name: null }]]
    );

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
    if (!TABLE_EXISTS_CACHE.exists) {
        return res.status(404).json({ message: 'Audit table not initialized' });
    }

    const { format = 'json' } = req.query;
    const { where, params } = buildWhereClause(req.query);

    const [data] = await pool.query(
        `SELECT a.* FROM sarga_enterprise_audit a ${where} ORDER BY a.timestamp DESC`,
        params
    );

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
    const filters = { date_from: req.query.date_from, date_to: req.query.date_to, user_id: req.query.user_id, branch_id: req.query.branch_id, module: req.query.module, action: req.query.action, status: req.query.status };
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
        const csvFields = [
            { label: 'Audit ID', key: 'audit_id' },
            { label: 'Timestamp', key: 'timestamp' },
            { label: 'Username', key: 'username' },
            { label: 'Employee Name', key: 'employee_name' },
            { label: 'Role', key: 'user_role' },
            { label: 'Branch', key: 'branch_name' },
            { label: 'Department', key: 'department' },
            { label: 'Module', key: 'module' },
            { label: 'Action', key: 'action_type' },
            { label: 'Record Type', key: 'record_type' },
            { label: 'Record ID', key: 'record_id' },
            { label: 'Document No', key: 'document_number' },
            { label: 'IP Address', key: 'ip_address' },
            { label: 'Device', key: 'device_name' },
            { label: 'Browser', key: 'browser' },
            { label: 'OS', key: 'operating_system' },
            { label: 'Status', key: 'success' },
            { label: 'Response Status', key: 'response_status' },
            { label: 'Error', key: 'error_message' },
            { label: 'Remarks', key: 'reason_remarks' },
            { label: 'Duration (ms)', key: 'duration_ms' },
            { label: 'Hash', key: 'current_hash' },
        ];
        const csvRows = [csvFields.map(f => f.label).join(',')];
        for (const r of exportData) {
            const row = csvFields.map(f => {
                const val = r[f.key] !== null && r[f.key] !== undefined ? r[f.key] : '';
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
    if (!TABLE_EXISTS_CACHE.exists) {
        return res.json({ success: true, data: { recordsChecked: 0, chainIntact: true, violations: [], firstRecord: null, lastRecord: null } });
    }

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
