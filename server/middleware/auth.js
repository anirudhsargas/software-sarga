const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const logger = require('../helpers/logger');

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

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const user = verifyWithAnySecret(token);
        req.user = user;
        next();
    } catch (err) {
        // Handle expired tokens specially so clients can react (refresh/login)
        if (err && err.name === 'TokenExpiredError') {
            logger.warn('[Auth] Token expired for request', { url: req.originalUrl || req.url, expiredAt: err.expiredAt });
            return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED', expiredAt: err.expiredAt });
        }

        return res.status(401).json({ message: 'Invalid or expired token.', code: 'INVALID_TOKEN' });
    }
};

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// New enhanced authenticate for three books system
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyWithAnySecret(token);

        // Fetch user from database
        const [users] = await pool.query(
            'SELECT id, user_id, role, name, branch_id FROM sarga_staff WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = users[0];
        // Debug log: help trace which user is authenticated for incoming requests
        try {
            logger.debug(`[Auth] user loaded id=${req.user.id} role=${req.user.role} branch_id=${req.user.branch_id}`);
        } catch (e) { }
        next();
    } catch (error) {
        if (error && error.name === 'TokenExpiredError') {
            logger.warn('Auth error: token expired', { url: req.originalUrl || req.url, expiredAt: error.expiredAt });
            return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Token expired', expiredAt: error.expiredAt });
        }

        logger.error('Auth error:', { error: error && (error.message || String(error)), url: req.originalUrl || req.url });
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Role-based access control middleware
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied. Insufficient permissions.',
                required: allowedRoles,
                current: req.user.role
            });
        }

        next();
    };
};

module.exports = { authenticateToken, authorizeRoles, JWT_SECRET, authenticate, requireRole, verifyWithAnySecret };
