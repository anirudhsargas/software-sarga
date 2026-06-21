const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret-at-least-32-chars-long-for-security!!';

const verifyWithAnySecret = (token) => jwt.verify(token, JWT_SECRET);

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  const normalizeRole = require('../middleware/auth').normalizeRole;
  const userRole = normalizeRole(req.user?.role);
  const allowed = roles.map(normalizeRole);
  if (!allowed.includes(userRole)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

const normalizeRole = (role) => {
  const map = {
    admin: 'Admin', 'front office': 'Front Office', designer: 'Designer',
    printer: 'Printer', accountant: 'Accountant', 'other staff': 'Other Staff',
  };
  return map[String(role || '').toLowerCase().trim()] || role;
};

const authenticate = authenticateToken;
const requireRole = authorizeRoles;

function generateToken(payload = {}) {
  return jwt.sign(
    { id: 1, user_id: 'admin', role: 'Admin', branch_id: 1, ...payload },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

module.exports = {
  authenticateToken, authorizeRoles, JWT_SECRET,
  authenticate, requireRole, verifyWithAnySecret, normalizeRole,
  generateToken,
};
