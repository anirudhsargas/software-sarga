const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-at-least-32-characters-long!!';

function createMockPool() {
  const mockQuery = jest.fn();
  const mockConnection = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn().mockResolvedValue(),
  };
  const mockGetConnection = jest.fn().mockResolvedValue(mockConnection);

  return {
    pool: { query: mockQuery, getConnection: mockGetConnection },
    mockQuery,
    mockConnection,
    mockGetConnection,
  };
}

function generateTestToken(overrides = {}) {
  const payload = {
    id: 1,
    user_id: 'admin',
    role: 'Admin',
    branch_id: 1,
    sub: '1',
    permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'],
    ...overrides,
  };
  return jwt.sign(payload, process.env.JWT_SECRET || JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { createMockPool, generateTestToken, JWT_SECRET };
