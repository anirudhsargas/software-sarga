const { pool } = require('../database');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../helpers/logger');

const AUDIT_QUEUE_MAX = 500;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 100;
const QUEUE_PROCESS_INTERVAL = 500;

let auditQueue = [];
let processing = false;
let lastHash = null;
let hashChainInitialized = false;

const getLastHash = async () => {
    if (lastHash) return lastHash;
    try {
        const [rows] = await pool.query(
            'SELECT current_hash FROM sarga_enterprise_audit ORDER BY id DESC LIMIT 1'
        );
        if (rows.length > 0) {
            lastHash = rows[0].current_hash;
        } else {
            lastHash = crypto.createHash('sha256').update('GENESIS_BLOCK_SARGA_2025').digest('hex');
        }
        hashChainInitialized = true;
        return lastHash;
    } catch (err) {
        logger.error('[AuditService] Failed to get last hash:', err.message);
        lastHash = crypto.createHash('sha256').update('GENESIS_BLOCK_SARGA_2025').digest('hex');
        hashChainInitialized = true;
        return lastHash;
    }
};

const computeHash = (data, previousHash) => {
    const payload = JSON.stringify(data) + previousHash + (data.timestamp || new Date().toISOString());
    return crypto.createHash('sha256').update(payload).digest('hex');
};

const extractUserAgentInfo = (ua) => {
    if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
    const result = { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
    if (ua.includes('Chrome') && !ua.includes('Edg')) result.browser = 'Chrome';
    else if (ua.includes('Firefox')) result.browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) result.browser = 'Safari';
    else if (ua.includes('Edg')) result.browser = 'Edge';
    else if (ua.includes('MSIE') || ua.includes('Trident')) result.browser = 'Internet Explorer';
    if (ua.includes('Windows')) result.os = 'Windows';
    else if (ua.includes('Mac OS')) result.os = 'macOS';
    else if (ua.includes('Linux') && !ua.includes('Android')) result.os = 'Linux';
    else if (ua.includes('Android')) { result.os = 'Android'; result.device = 'Mobile'; }
    else if (ua.includes('iPhone') || ua.includes('iPad')) { result.os = 'iOS'; result.device = 'Mobile'; }
    if (ua.includes('Mobile')) result.device = 'Mobile';
    if (ua.includes('Tablet')) result.device = 'Tablet';
    return result;
};

const logAudit = async (entry) => {
    try {
        const prevHash = await getLastHash();
        const auditId = uuidv4();
        const timestamp = new Date().toISOString().slice(0, 23);
        const hashData = { ...entry, auditId, timestamp };
        const currentHash = computeHash(hashData, prevHash);

        const uaInfo = entry.userAgent ? extractUserAgentInfo(entry.userAgent) : {};

        const values = [
            auditId,
            timestamp,
            entry.userId || null,
            entry.username || null,
            entry.employeeName || null,
            entry.userRole || null,
            entry.branchId || null,
            entry.branchName || null,
            entry.department || null,
            entry.module || 'Unknown',
            entry.actionType || 'Unknown',
            entry.recordType || null,
            entry.recordId ? String(entry.recordId) : null,
            entry.documentNumber || null,
            entry.previousValues ? JSON.stringify(entry.previousValues) : null,
            entry.newValues ? JSON.stringify(entry.newValues) : null,
            entry.changedFields ? JSON.stringify(entry.changedFields) : null,
            entry.ipAddress || null,
            uaInfo.device || entry.deviceName || null,
            uaInfo.browser || entry.browser || null,
            uaInfo.os || entry.operatingSystem || null,
            entry.sessionId || null,
            entry.apiEndpoint || null,
            entry.responseStatus || null,
            entry.success !== undefined ? (entry.success ? 1 : 0) : 1,
            entry.errorMessage || null,
            entry.reasonRemarks || null,
            entry.latitude || null,
            entry.longitude || null,
            entry.durationMs || null,
            prevHash,
            currentHash,
        ];

        await pool.query(
            `INSERT INTO sarga_enterprise_audit
             (audit_id, timestamp, user_id_internal, username, employee_name, user_role, branch_id, branch_name, department, module, action_type, record_type, record_id, document_number, previous_values, new_values, changed_fields, ip_address, device_name, browser, operating_system, session_id, api_endpoint, response_status, success, error_message, reason_remarks, latitude, longitude, duration_ms, previous_hash, current_hash)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            values
        );

        lastHash = currentHash;
    } catch (err) {
        logger.error('[AuditService] Log write failed:', err.message);
    }
};

const enqueueAudit = (entry) => {
    if (auditQueue.length >= AUDIT_QUEUE_MAX) {
        processBatch();
    }
    auditQueue.push(entry);
};

const processBatch = async () => {
    if (auditQueue.length === 0) return;
    const batch = auditQueue.splice(0, MAX_BATCH_SIZE);
    for (const entry of batch) {
        try {
            await logAudit(entry);
        } catch (err) {
            logger.error('[AuditService] Batch item failed:', err.message);
        }
    }
};

const processQueue = async () => {
    if (processing) return;
    processing = true;
    try {
        await processBatch();
    } catch (err) {
        logger.error('[AuditService] Queue processing error:', err.message);
    } finally {
        processing = false;
    }
};

setInterval(processQueue, QUEUE_PROCESS_INTERVAL);

const flushQueue = async () => {
    while (auditQueue.length > 0) {
        await processBatch();
    }
};

const createAuditEntry = async (req, data = {}) => {
    const entry = {
        userId: req?.user?.id || data.userId,
        username: req?.user?.user_id || data.username,
        employeeName: req?.user?.name || data.employeeName,
        userRole: req?.user?.role || data.userRole,
        branchId: req?.user?.branch_id || data.branchId,
        branchName: data.branchName,
        department: data.department,
        module: data.module || 'Unknown',
        actionType: data.actionType || 'Unknown',
        recordType: data.recordType,
        recordId: data.recordId,
        documentNumber: data.documentNumber,
        previousValues: data.previousValues || null,
        newValues: data.newValues || null,
        changedFields: data.changedFields || null,
        ipAddress: req?.ip || data.ipAddress || req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress,
        userAgent: req?.headers?.['user-agent'] || data.userAgent,
        sessionId: req?.headers?.['authorization']?.split(' ')?.[1]?.slice(-20) || data.sessionId,
        apiEndpoint: req?.originalUrl || req?.url || data.apiEndpoint,
        responseStatus: data.responseStatus || 200,
        success: data.success !== undefined ? data.success : true,
        errorMessage: data.errorMessage || null,
        reasonRemarks: data.reasonRemarks || null,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        durationMs: data.durationMs || null,
    };

    if (data.userAgent) {
        const uaInfo = extractUserAgentInfo(data.userAgent);
        entry.deviceName = uaInfo.device;
        entry.browser = uaInfo.browser;
        entry.operatingSystem = uaInfo.os;
    }

    enqueueAudit(entry);
};

const getClientInfo = (req) => ({
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    sessionId: req.headers['authorization']?.split(' ')?.[1]?.slice(-20),
    apiEndpoint: req.originalUrl || req.url,
});

const detectChanges = (oldData, newData) => {
    if (!oldData || !newData) return { previousValues: oldData, newValues: newData, changedFields: Object.keys(newData || {}) };
    const changed = {};
    for (const key of Object.keys(newData)) {
        const oldVal = oldData[key];
        const newVal = newData[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changed[key] = { from: oldVal, to: newVal };
        }
    }
    return {
        previousValues: oldData,
        newValues: newData,
        changedFields: Object.keys(changed).length > 0 ? changed : null,
    };
};

const getModuleFromPath = (path) => {
    if (!path) return 'Unknown';
    const p = path.toLowerCase();
    if (p.includes('/auth/')) return 'Authentication';
    if (p.includes('/customers')) return 'Customer';
    if (p.includes('/vendors') || p.includes('/vendor-')) return 'Vendor';
    if (p.includes('/inventory') || p.includes('/stock-')) return 'Inventory';
    if (p.includes('/products')) return 'Product';
    if (p.includes('/paper') || p.includes('/paperInventory')) return 'Paper Inventory';
    if (p.includes('/purchase')) return 'Purchase';
    if (p.includes('/sales') || p.includes('/jobs') || p.includes('/orders')) return 'Sales';
    if (p.includes('/invoice') || p.includes('/billing')) return 'Billing';
    if (p.includes('/quotes') || p.includes('/quotations')) return 'Quotation';
    if (p.includes('/payments') || p.includes('/payment')) return 'Payment';
    if (p.includes('/expense')) return 'Expenses';
    if (p.includes('/salary') || p.includes('/payroll')) return 'Payroll';
    if (p.includes('/attendance') || p.includes('/cctv')) return 'Attendance';
    if (p.includes('/machines') || p.includes('/machine')) return 'Production';
    if (p.includes('/staff') || p.includes('/users')) return 'Users';
    if (p.includes('/branches')) return 'Settings';
    if (p.includes('/settings') || p.includes('/company')) return 'Settings';
    if (p.includes('/backup')) return 'Backup';
    if (p.includes('/reports') || p.includes('/report')) return 'Reports';
    if (p.includes('/whatsapp') || p.includes('/email') || p.includes('/message')) return 'Communication';
    if (p.includes('/ai') || p.includes('/ml') || p.includes('/ocr') || p.includes('/bill')) return 'AI Operations';
    if (p.includes('/barcode') || p.includes('/label') || p.includes('/print')) return 'Printing';
    if (p.includes('/rate') || p.includes('/pricing') || p.includes('/gst') || p.includes('/tax')) return 'Settings';
    return 'Unknown';
};

module.exports = {
    createAuditEntry,
    getClientInfo,
    detectChanges,
    getModuleFromPath,
    flushQueue,
    enqueueAudit,
    extractUserAgentInfo,
};
