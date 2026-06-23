const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const TEST_JWT_SECRET = 'test_jwt_secret_key_that_is_at_least_32_chars_long_for_sarga_only';

function createTestToken(overrides = {}) {
  return jwt.sign(
    {
      id: 1,
      user_id: 'admin',
      role: 'Admin',
      branch_id: 1,
      sub: '1',
      branch: 1,
      permissions: ['view_dashboard', 'manage_orders', 'manage_customers', 'manage_inventory', 'manage_staff', 'manage_expenses', 'manage_vendors', 'view_reports', 'manage_designs', 'manage_blog'],
      ...overrides,
    },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function createMockDb(initialData = {}) {
  const tables = { ...initialData };
  const executionLog = [];

  const mockPool = {
    query: jest.fn(async (sql, params) => {
      executionLog.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      const sqlStr = String(sql).replace(/\s+/g, ' ').trim();

      if (/SELECT\s+1\s+AS\s+ok/i.test(sqlStr)) {
        return [[{ ok: 1 }]];
      }
      if (/SELECT\s+1/i.test(sqlStr) && !/FROM/i.test(sqlStr)) {
        return [[{ '1': 1 }]];
      }
      if (/is_revoked/i.test(sqlStr) && /sarga_user_sessions/i.test(sqlStr)) {
        return [[]];
      }
      if (/INSERT\s+INTO\s+sarga_audit_logs/i.test(sqlStr)) {
        return [{ insertId: 1 }];
      }
      if (/INSERT\s+INTO/i.test(sqlStr)) {
        return [{ insertId: 999, affectedRows: 1 }];
      }
      if (/UPDATE/i.test(sqlStr)) {
        return [{ affectedRows: 1 }];
      }
      if (/DELETE/i.test(sqlStr)) {
        return [{ affectedRows: 1 }];
      }
      if (/SELECT\s+COUNT/i.test(sqlStr)) {
        return [[{ count: 0 }]];
      }

      const fromMatch = sqlStr.match(/FROM\s+`?(\w+)`?\s*/i);
      const tableName = fromMatch ? fromMatch[1] : null;

      if (tableName && tables[tableName]) {
        return [tables[tableName]];
      }

      return [[]];
    }),
    getConnection: jest.fn(async () => mockPool),
    release: jest.fn(),
    beginTransaction: jest.fn(async () => {}),
    commit: jest.fn(async () => {}),
    rollback: jest.fn(async () => {}),
    execute: jest.fn(async (sql, params) => {
      executionLog.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      return [{ affectedRows: 1 }];
    }),
  };

  return { mockPool, executionLog, tables };
}

function setTableData(tables, tableName, data) {
  tables[tableName] = data;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 4);
}

module.exports = {
  TEST_JWT_SECRET,
  createTestToken,
  createMockDb,
  setTableData,
  hashPassword,
};
