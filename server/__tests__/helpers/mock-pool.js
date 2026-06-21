/**
 * Mock MySQL pool factory for integration tests.
 * Provides a drop-in replacement for `server/database.js` that
 * records all queries for assertions and returns configurable results.
 *
 * Usage:
 *   jest.mock('../../database', () => require('./helpers/mock-pool').createMockPool());
 *
 * Override results per-test:
 *   const { mockPool } = require('./helpers/mock-pool');
 *   mockPool.setResult('SELECT 1 AS ok', [[{ ok: 1 }]]);
 */

const realPool = (() => {
  try {
    if (
      process.env.TEST_DB_HOST &&
      process.env.TEST_DB_USER
    ) {
      const mysql = require('mysql2/promise');
      return mysql.createPool({
        host: process.env.TEST_DB_HOST,
        port: Number(process.env.TEST_DB_PORT) || 3306,
        user: process.env.TEST_DB_USER,
        password: process.env.TEST_DB_PASSWORD || '',
        database: process.env.TEST_DB_NAME || 'sarga_test',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });
    }
  } catch (_) { /* fall through to mock */ }
  return null;
})();

const USE_REAL_DB = !!realPool;

let queryLog = [];
let resultOverrides = {};

function buildMockPool() {
  const mockQuery = jest.fn(async (sql, params) => {
    queryLog.push({ sql: String(sql), params });
    const key = String(sql).trim().substring(0, 80);
    if (resultOverrides[key]) {
      return resultOverrides[key];
    }
    if (String(sql).toUpperCase().includes('SELECT')) {
      return [[]];
    }
    if (String(sql).toUpperCase().includes('INSERT')) {
      return [{ insertId: Date.now() % 10000 + 1 }];
    }
    if (String(sql).toUpperCase().includes('UPDATE') || String(sql).toUpperCase().includes('DELETE')) {
      return [{ affectedRows: 1 }];
    }
    return [{}];
  });

  const mockGetConnection = jest.fn(async () => {
    let released = false;
    return {
      query: mockQuery,
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(() => { released = true; }),
      get released() { return released; },
    };
  });

  return {
    pool: {
      query: mockQuery,
      getConnection: mockGetConnection,
      end: jest.fn(),
    },
    initDb: jest.fn().mockResolvedValue(undefined),
  };
}

const mockState = USE_REAL_DB
  ? null
  : buildMockPool();

if (!USE_REAL_DB) {
  jest.mock('../../helpers/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  }));
}

module.exports = {
  get pool() {
    if (USE_REAL_DB) return realPool;
    return mockState.pool;
  },
  get initDb() {
    if (USE_REAL_DB) {
      return async () => { /* user-managed schema */ };
    }
    return mockState.initDb;
  },
  USE_REAL_DB,
  clearLog() { queryLog = []; },
  getLog() { return [...queryLog]; },
  resultOverrides,
  setResult(sqlFragment, result) {
    resultOverrides[sqlFragment] = result;
  },
  clearOverrides() {
    Object.keys(resultOverrides).forEach(k => delete resultOverrides[k]);
  },
  resetAll() {
    this.clearLog();
    this.clearOverrides();
    if (mockState) {
      mockState.pool.query.mockClear();
      mockState.pool.getConnection.mockClear();
    }
  },
};
