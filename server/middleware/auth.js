const jwt = require('jsonwebtoken');
const { pool } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
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
        const decoded = jwt.verify(token, JWT_SECRET);

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
            console.log(`[Auth] user loaded id=${req.user.id} role=${req.user.role} branch_id=${req.user.branch_id}`);
        } catch (e) { }
        next();
    } catch (error) {
        console.error('Auth error:', error);
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

module.exports = { authenticateToken, authorizeRoles, JWT_SECRET, authenticate, requireRole };
