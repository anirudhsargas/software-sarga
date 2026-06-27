const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../database');
const logger = require('../helpers/logger');
const SESSION_CACHE_TTL = parseInt(process.env.SESSION_CACHE_TTL || '43200', 10);

// In-memory token blacklist (Set of SHA256 hashes)
const revokedTokens = new Set();

// Periodic cleanup of the revoked tokens Set to prevent unbounded growth.
// Since tokens use a TTL and are only revoked during logout/password-change,
// this Set will remain small in practice. Cleanup runs every 30 minutes
// and clears entries older than SESSION_CACHE_TTL (default 12h).
const revokedTimestamps = new Map();
setInterval(() => {
    const now = Date.now();
    const maxAge = SESSION_CACHE_TTL * 1000;
    for (const [hash, ts] of revokedTimestamps) {
        if (now - ts > maxAge) {
            revokedTokens.delete(hash);
            revokedTimestamps.delete(hash);
        }
    }
}, 30 * 60 * 1000);

function sessionCacheKey(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return `sarga:session:${hash}`;
}

/**
 * Check session revocation — in-memory blacklist first, then DB fallback.
 * Returns true if session IS revoked (should reject), false if valid.
 */
async function isSessionRevoked(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    // Fast path: check in-memory blacklist first
    if (revokedTokens.has(hash)) {
        return true;
    }
    // Fallback: check DB
    try {
        const [sessions] = await pool.query('SELECT is_revoked FROM sarga_user_sessions WHERE session_token = ? LIMIT 1', [token]);
        if (sessions.length > 0 && sessions[0].is_revoked) {
            revokedTokens.add(hash);
            revokedTimestamps.set(hash, Date.now());
            return true;
        }
        return false;
    } catch (dbErr) {
        logger.error('Session DB check error:', dbErr);
        return true;
    }
}

/**
 * Mark a token as revoked — adds to in-memory blacklist.
 * Works without Redis by using an in-memory Set of revoked token hashes.
 */
async function revokeSessionInCache(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    revokedTokens.add(hash);
    revokedTimestamps.set(hash, Date.now());
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;
if (!JWT_SECRET || JWT_SECRET === 'printing_shop_secret_key_2025' || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or weak. Set a random 256-bit secret in environment.');
}

const jwtSecrets = [JWT_SECRET];
if (JWT_SECRET_PREVIOUS && JWT_SECRET_PREVIOUS !== JWT_SECRET) {
    jwtSecrets.push(JWT_SECRET_PREVIOUS);
}

const verifyWithAnySecret = (token) => {
    let lastError;
    for (const secret of jwtSecrets) {
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Invalid token');
};

const authenticateToken = async (req, res, next) => {
    // Prevent browser caching for protected routes
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        logger.warn('[Auth] 401 No token provided', { path: req.path, method: req.method, ip: req.ip });
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const user = verifyWithAnySecret(token);
        
        // Verify session is not revoked (Redis-first, DB fallback)
        if (await isSessionRevoked(token)) {
            return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.warn('[Auth] 401 Invalid token', { path: req.path, method: req.method, ip: req.ip, error: error.message });
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        const userRoleNormalized = normalizeRole(req?.user?.role);
        const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
        if (!req.user || !normalizedAllowedRoles.includes(userRoleNormalized)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// New enhanced authenticate for three books system
const authenticate = async (req, res, next) => {
    // Prevent browser caching for protected routes
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    try {
        const authHeader = req.headers.authorization;
        const tokenPresent = !!(authHeader && authHeader.startsWith('Bearer '));
        if (!tokenPresent) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyWithAnySecret(token);

        // Verify session is not revoked (Redis-first, DB fallback)
        if (await isSessionRevoked(token)) {
            return res.status(401).json({ error: 'Session has been revoked' });
        }

        // Fetch user from database
        const [users] = await pool.query(
            'SELECT id, user_id, role, name, branch_id FROM sarga_staff WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = users[0];

        // --- ENFORCE FRONT OFFICE BRANCH RULES ---
        if (normalizeRole(req.user.role) === 'Front Office') {
            const method = req.method.toUpperCase();
            
            // For GET/DELETE/HEAD requests, override query params
            if (['GET', 'DELETE', 'HEAD'].includes(method)) {
                if (!req.query) req.query = {};
                req.query.branch_id = req.user.branch_id;
            } 
            // For POST/PUT/PATCH, enforce body validation
            else if (['POST', 'PUT', 'PATCH'].includes(method)) {
                if (!req.body) req.body = {};
                
                // If they provided a branch_id and it mismatches, reject
                if (req.body.branch_id && String(req.body.branch_id) !== String(req.user.branch_id)) {
                    return res.status(403).json({ error: 'Branch access denied. Your account is restricted to your assigned branch.' });
                }
                
                // Always ensure branch_id is correctly set
                req.body.branch_id = req.user.branch_id;
            }
        }
        // -----------------------------------------

        next();
    } catch (error) {
        logger.error('Auth error:', error);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Role-based access control middleware
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userRoleNormalized = normalizeRole(req.user.role);
        const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

        if (!normalizedAllowedRoles.includes(userRoleNormalized)) {
            return res.status(403).json({
                error: 'Access denied. Insufficient permissions.',
                required: normalizedAllowedRoles,
                current: userRoleNormalized
            });
        }

        next();
    };
};

/**
 * Normalize role string to canonical casing.
 * "Front Office" → "Front Office", "front office" → "Front Office", "FRONT OFFICE" → "Front Office"
 */
function normalizeRole(role) {
    if (!role || typeof role !== 'string') return role;
    const map = {
        'admin': 'Admin',
        'front office': 'Front Office',
        'designer': 'Designer',
        'printer': 'Printer',
        'accountant': 'Accountant',
        'other staff': 'Other Staff',
    };
    return map[role.toLowerCase().trim()] || role;
}

/**
 * Check customer session revocation — in-memory blacklist first, then DB fallback.
 * Queries sarga_customer_sessions (not sarga_user_sessions).
 * Returns true if session IS revoked (should reject), false if valid.
 */
async function isCustomerSessionRevoked(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    if (revokedTokens.has(hash)) {
        return true;
    }
    try {
        const [sessions] = await pool.query(
            'SELECT is_revoked FROM sarga_customer_sessions WHERE session_token = ? LIMIT 1',
            [token]
        );
        if (sessions.length > 0 && sessions[0].is_revoked) {
            revokedTokens.add(hash);
            revokedTimestamps.set(hash, Date.now());
            return true;
        }
        return false;
    } catch (dbErr) {
        logger.error('Customer session DB check error:', dbErr);
        return true; // fail-closed
    }
}

/**
 * Mark a customer token as revoked — adds to in-memory blacklist.
 */
async function revokeCustomerSessionInCache(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    revokedTokens.add(hash);
    revokedTimestamps.set(hash, Date.now());
}

/**
 * Express middleware for authenticated customer routes.
 * Verifies Bearer JWT, checks role === 'Customer', checks session revocation.
 * Sets req.customer = decoded payload on success.
 */
const authenticateCustomer = async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const decoded = verifyWithAnySecret(token);
        if (decoded.role !== 'Customer') {
            return res.status(403).json({ message: 'Customer access required' });
        }
        if (await isCustomerSessionRevoked(token)) {
            return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
        }
        req.customer = decoded;
        next();
    } catch (err) {
        logger.warn('[Auth] Customer token invalid', { path: req.path, error: err.message });
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

module.exports = { authenticateToken, authorizeRoles, authenticate, requireRole, verifyWithAnySecret, normalizeRole, sessionCacheKey, revokeSessionInCache, authenticateCustomer, isCustomerSessionRevoked, revokeCustomerSessionInCache, JWT_SECRET };
