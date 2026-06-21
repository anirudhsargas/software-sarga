const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Store original env and restore after
const _saveEnv = Object.assign({}, process.env);

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long!!';
  process.env.JWT_SECRET_PREVIOUS = '';
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.DB_USER = process.env.TEST_DB_USER || 'test';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test';
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'sarga_test';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
});

afterAll(() => {
  Object.assign(process.env, _saveEnv);
});

beforeEach(() => {
  jest.clearAllMocks();
});

function generateToken(overrides = {}) {
  const payload = {
    id: 1,
    user_id: '9876543210',
    role: 'Admin',
    branch_id: 1,
    sub: '1',
    branch: 1,
    permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'],
    ...overrides,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const frontOfficeToken = generateToken({ id: 2, user_id: '9876543211', role: 'Front Office', branch_id: 2, permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory'] });
const accountantToken = generateToken({ id: 3, user_id: '9876543212', role: 'Accountant', branch_id: 1, permissions: ['view_dashboard', 'manage_orders', 'manage_inventory', 'manage_expenses', 'manage_vendors', 'view_reports'] });
const designerToken = generateToken({ id: 4, user_id: '9876543213', role: 'Designer', branch_id: 1, permissions: ['view_dashboard', 'manage_designs', 'manage_blog'] });
const revocableToken = generateToken({ id: 5, user_id: '9876543214', role: 'Admin', branch_id: 1 });

function makeAuthHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function mockQueryOnce(mockPool, fn) {
  mockPool.query.mockImplementationOnce(fn);
}

function createMockPool() {
  const pool = { query: jest.fn() };
  pool.query.mockResolvedValue([[]]);
  return pool;
}

function resetMockPool(mockPool) {
  mockPool.query.mockReset();
  mockPool.query.mockResolvedValue([[]]);
}

// Generates a hashed password for test users
async function hashPassword(password) {
  return bcrypt.hashSync(password, 4);
}

module.exports = {
  generateToken,
  frontOfficeToken,
  accountantToken,
  designerToken,
  revocableToken,
  makeAuthHeader,
  mockQueryOnce,
  createMockPool,
  resetMockPool,
  hashPassword,
};
