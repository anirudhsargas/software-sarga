const { createAuditEntry, getModuleFromPath, detectChanges } = require('../services/auditService');

const getActionFromMethod = (method) => {
    const map = {
        POST: 'Create',
        PUT: 'Update',
        PATCH: 'Update',
        DELETE: 'Delete',
        GET: 'View',
    };
    return map[method] || 'Unknown';
};

const shouldSkip = (req) => {
    const path = req.path || req.url || '';
    const skipPaths = [
        '/api/health', '/api/ping', '/api/server-time', '/api/version',
        '/api/company-settings', '/api/i18n/', '/uploads/',
        '/api/audit/logs',
    ];
    if (skipPaths.some(sp => path.startsWith(sp))) return true;
    if (req.method === 'OPTIONS') return true;
    if (req.method === 'GET' && !path.includes('/export')) return true;
    return false;
};

const auditMiddleware = (options = {}) => {
    return (req, res, next) => {
        if (shouldSkip(req)) return next();

        const startTime = Date.now();
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        let responseBody = null;

        res.json = (body) => {
            responseBody = body;
            return originalJson(body);
        };

        res.send = (body) => {
            if (!responseBody) responseBody = body;
            return originalSend(body);
        };

        const originalEnd = res.end.bind(res);
        res.end = (...args) => {
            const duration = Date.now() - startTime;
            const success = res.statusCode < 400;

            if (!success || req.method !== 'GET') {
                const actionType = options.actionType || getActionFromMethod(req.method);

                let errorMsg = null;
                if (!success && responseBody) {
                    try {
                        const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
                        errorMsg = parsed?.message || parsed?.error || null;
                    } catch { }
                }

                let recordId = null;
                let recordType = null;
                if (req.params?.id) {
                    recordId = req.params.id;
                } else if (req.params?.customerId) {
                    recordId = req.params.customerId;
                } else if (req.params?.jobId) {
                    recordId = req.params.jobId;
                } else if (req.params?.paymentId) {
                    recordId = req.params.paymentId;
                } else if (responseBody && typeof responseBody === 'object' && responseBody?.id) {
                    recordId = responseBody.id;
                }

                if (req.baseUrl && req.route?.path) {
                    const segments = req.baseUrl.split('/').filter(Boolean);
                    const routeSegments = req.route.path.split('/').filter(Boolean);
                    if (routeSegments.includes(':id') && req.params?.id) {
                        recordId = req.params.id;
                    }
                }

                const path = req.originalUrl || req.url;
                let moduleName = options.module || getModuleFromPath(path);

                setImmediate(() => {
                    createAuditEntry(req, {
                        module: moduleName,
                        actionType,
                        recordType: options.recordType || recordType,
                        recordId: recordId || req.body?.id || null,
                        documentNumber: options.documentNumber || req.body?.invoice_no || req.body?.purchase_no || req.body?.job_no || req.body?.expense_id || null,
                        previousValues: options.previousValues || null,
                        newValues: options.newValues || (req.method !== 'GET' ? req.body : null) || null,
                        changedFields: options.changedFields || null,
                        responseStatus: res.statusCode,
                        success,
                        errorMessage: errorMsg,
                        durationMs: duration,
                        reasonRemarks: options.reasonRemarks || null,
                    }).catch(err => console.error('[AuditMiddleware] Log error:', err));
                });
            }

            return originalEnd(...args);
        };

        next();
    };
};

const auditAction = (actionType, module, options = {}) => {
    return (req, res, next) => {
        const middleware = auditMiddleware({
            ...options,
            actionType,
            module,
        });
        return middleware(req, res, next);
    };
};

module.exports = { auditMiddleware, auditAction };
