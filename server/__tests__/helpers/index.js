const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_only_32chars!';

const adminTokenPayload = {
  id: 1,
  user_id: 'admin@test.com',
  role: 'Admin',
  branch_id: 1,
  sub: '1',
  branch: 1,
  permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'],
};

const frontOfficeTokenPayload = {
  id: 2,
  user_id: 'fo@test.com',
  role: 'Front Office',
  branch_id: 1,
  sub: '2',
  branch: 1,
  permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory'],
};

const accountantTokenPayload = {
  id: 3,
  user_id: 'acc@test.com',
  role: 'Accountant',
  branch_id: 1,
  sub: '3',
  branch: 1,
  permissions: ['view_dashboard', 'manage_orders', 'manage_inventory', 'manage_expenses', 'manage_vendors', 'view_reports'],
};

function generateToken(payload = adminTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

const adminToken = generateToken(adminTokenPayload);
const frontOfficeToken = generateToken(frontOfficeTokenPayload);
const accountantToken = generateToken(accountantTokenPayload);

function authHeader(token = adminToken) {
  return ['Authorization', `Bearer ${token}`];
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = {
  adminToken,
  frontOfficeToken,
  accountantToken,
  generateToken,
  authHeader,
  hashPassword,
  adminTokenPayload,
  frontOfficeTokenPayload,
  accountantTokenPayload,
  JWT_SECRET,
};
