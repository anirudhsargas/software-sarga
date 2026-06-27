/**
 * Mock MySQL pool factory for integration tests.
 * Provides an in-memory database mock replacement for `server/database.js`.
 */

const realPool = null;
const USE_REAL_DB = false;

let queryLog = [];
let resultOverrides = {};

function buildMockPool() {
  const tables = {
    sarga_branches: [],
    sarga_staff: [],
    vendors: [],
    vendor_invoices: [],
    vendor_payments: [],
    vendor_statements: []
  };

  let nextIds = {
    sarga_branches: 1,
    sarga_staff: 1,
    vendors: 1,
    vendor_invoices: 1,
    vendor_payments: 1,
    vendor_statements: 1
  };

  const mockQuery = jest.fn(async (sql, params) => {
    const sqlStr = String(sql).replace(/\s+/g, ' ').trim();
    const sqlUpper = sqlStr.toUpperCase();
    
    // Log the query
    queryLog.push({ sql: sqlStr, params });

    // Handle setResult overrides
    const key = sqlStr.substring(0, 80);
    if (resultOverrides[key]) {
      return resultOverrides[key];
    }

    // --- 1. DELETE FROM (cleanTestData) ---
    if (sqlUpper.startsWith('DELETE FROM')) {
      const match = sqlStr.match(/DELETE FROM\s+`?(\w+)`?/i);
      const tableName = match ? match[1] : null;
      if (tableName && tables[tableName]) {
        tables[tableName] = [];
        nextIds[tableName] = 1;
      }
      return [{ affectedRows: 0 }];
    }

    // --- 2. INSERT INTO ---
    if (sqlUpper.startsWith('INSERT INTO')) {
      const match = sqlStr.match(/INSERT INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const columns = match[2].split(',').map(c => c.trim().replace(/`/g, ''));
        if (tables[tableName]) {
          const id = nextIds[tableName]++;
          const row = { id };
          columns.forEach((col, idx) => {
            row[col] = params ? params[idx] : undefined;
          });
          if (row.is_active === undefined) row.is_active = 1;
          tables[tableName].push(row);
          return [{ insertId: id, affectedRows: 1 }];
        }
      }
      // Fallback for general insert
      const fallbackMatch = sqlStr.match(/INSERT INTO\s+`?(\w+)`?/i);
      const fallbackTable = fallbackMatch ? fallbackMatch[1] : 'unknown';
      const id = nextIds[fallbackTable] ? nextIds[fallbackTable]++ : Math.floor(Math.random() * 1000) + 1;
      return [{ insertId: id, affectedRows: 1 }];
    }

    // --- 3. SELECT ---
    if (sqlUpper.startsWith('SELECT') || sqlUpper.includes('SELECT ')) {
      const fromMatch = sqlStr.match(/FROM\s+`?(\w+)`?/i);
      const tableName = fromMatch ? fromMatch[1] : null;

      if (tableName && tables[tableName]) {
        let rows = [...tables[tableName]];

        // Handle SELECT COUNT(*)
        if (sqlUpper.includes('COUNT(')) {
          if (sqlStr.includes('vendor_id = ?')) {
            const vendorId = params[0];
            rows = rows.filter(r => Number(r.vendor_id) === Number(vendorId));
          }
          if (sqlStr.includes('paid_amount < amount')) {
            rows = rows.filter(r => Number(r.paid_amount || 0) < Number(r.amount || 0));
          }
          return [[{ count: rows.length, 'COUNT(*)': rows.length }]];
        }

        // Apply where filters
        if (sqlStr.includes('WHERE v.id = ?') || sqlStr.includes('WHERE id = ?') || sqlStr.includes('WHERE vi.vendor_id = ?') || sqlStr.includes('WHERE vp.vendor_id = ?')) {
          const id = params[0];
          if (sqlStr.includes('vendor_id = ?')) {
            rows = rows.filter(r => Number(r.vendor_id) === Number(id));
          } else {
            rows = rows.filter(r => Number(r.id) === Number(id));
          }
        } else if (sqlStr.includes('WHERE name = ?') || sqlStr.includes('WHERE v.name = ?')) {
          const name = params[0];
          rows = rows.filter(r => String(r.name).toLowerCase() === String(name).toLowerCase());
        } else if (sqlStr.includes('WHERE vendor_code = ?')) {
          const code = params[0];
          rows = rows.filter(r => String(r.vendor_code).toLowerCase() === String(code).toLowerCase());
        }

        if (sqlStr.includes('is_active = TRUE') || sqlStr.includes('is_active = 1')) {
          rows = rows.filter(r => r.is_active === 1 || r.is_active === true);
        }

        if (tableName === 'vendors' && sqlStr.includes('total_spend')) {
          rows = rows.map(v => {
            const vendorInvoices = tables.vendor_invoices.filter(vi => vi.vendor_id === v.id);
            const totalSpend = vendorInvoices.reduce((sum, vi) => sum + Number(vi.amount || 0), 0);
            const pendingAmount = vendorInvoices.reduce((sum, vi) => sum + (Number(vi.amount || 0) - Number(vi.paid_amount || 0)), 0);
            return {
              ...v,
              total_spend: totalSpend,
              pending_amount: pendingAmount,
              total_invoices: vendorInvoices.length
            };
          });
        }

        return [rows];
      }
      
      // Fallback for non-table queries (like SELECT 1)
      if (sqlUpper.includes('SELECT 1')) {
        return [[{ '1': 1, ok: 1 }]];
      }
      return [[]];
    }

    // --- 4. UPDATE ---
    if (sqlUpper.startsWith('UPDATE')) {
      const match = sqlStr.match(/UPDATE\s+`?(\w+)`?/i);
      const tableName = match ? match[1] : null;
      if (tableName && tables[tableName] && params) {
        if (sqlStr.includes('WHERE id = ?')) {
          const id = params[params.length - 1];
          const row = tables[tableName].find(r => r.id === id);
          if (row) {
            if (sqlStr.includes('is_active = FALSE')) {
              row.is_active = 0;
            }
          }
        }
      }
      return [{ affectedRows: 1 }];
    }

    return [[]];
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

const mockState = buildMockPool();

module.exports = {
  get pool() {
    return mockState.pool;
  },
  get initDb() {
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
