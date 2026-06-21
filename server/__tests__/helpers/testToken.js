const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function generateTestToken(overrides = {}) {
  const defaultPayload = {
    id: 1,
    user_id: 'admin',
    role: 'Admin',
    branch_id: 1,
    sub: '1',
    branch: 1,
    permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'],
  };

  return jwt.sign({ ...defaultPayload, ...overrides }, JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { generateTestToken };
