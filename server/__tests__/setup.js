jest.mock('../database', () => require('./helpers/mock-pool'));

const TEST_DB_VARS = ['HOST', 'PORT', 'USER', 'PASSWORD', 'NAME', 'SSL'];
for (const v of TEST_DB_VARS) {
  const testVal = process.env[`TEST_DB_${v}`];
  if (testVal) {
    process.env[`DB_${v}`] = testVal;
  }
}

if (!process.env.DB_HOST) {
  process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
  process.env.DB_USER = process.env.TEST_DB_USER || 'root';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'sarga_test';
}

process.env.NODE_ENV = 'test';
process.env.DB_SSL = 'false';
process.env.PGSSLMODE = 'disable';
const { TEST_JWT_SECRET } = require('./helpers/testUtils');
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET;
process.env.JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';

const { createTestApp } = require('./helpers/test-app');
const { generateTestToken } = require('./helpers/testFactory');
const { pool } = require('./helpers/mock-pool');

const app = createTestApp();

async function cleanTestData() {
  const tables = [
    'vendor_payments',
    'vendor_invoices',
    'vendors',
    'sarga_staff',
    'sarga_branches'
  ];
  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM ${table}`);
    } catch (_e) {}
  }
}

async function insertTestBranch(branch) {
  const [res] = await pool.query(
    'INSERT INTO sarga_branches (name, address, phone) VALUES (?, ?, ?)',
    [branch.name, branch.address || '', branch.phone || '']
  );
  return res.insertId;
}

async function insertTestStaff(staff) {
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync(staff.password, 4);
  const [res] = await pool.query(
    'INSERT INTO sarga_staff (user_id, password, role, name, branch_id) VALUES (?, ?, ?, ?, ?)',
    [staff.user_id, hashedPassword, staff.role, staff.name, staff.branch_id]
  );
  return res.insertId;
}

async function insertTestVendor(vendor) {
  const [res] = await pool.query(
    'INSERT INTO vendors (name, category, credit_days, credit_limit, notes, vendor_code) VALUES (?, ?, ?, ?, ?, ?)',
    [
      vendor.name,
      vendor.category || 'other',
      vendor.credit_days || 0,
      vendor.credit_limit || 0,
      vendor.notes || '',
      vendor.vendor_code || 'TST'
    ]
  );
  return res.insertId;
}

module.exports = {
  app,
  generateTestToken,
  insertTestBranch,
  insertTestStaff,
  insertTestVendor,
  cleanTestData,
  testPool: pool
};
