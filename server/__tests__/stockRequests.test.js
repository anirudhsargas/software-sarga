jest.mock('../database');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../database');

let adminToken;
let staffBranch1Token;
let staffBranch2Token;

const sampleRequest = {
  id: 10,
  inventory_item_id: 1,
  from_branch_id: 1,
  to_branch_id: 2,
  quantity: 5,
  notes: 'Need this urgently',
  status: 'Pending',
  created_by: 2,
  resolved_by: null,
  resolved_at: null,
  sent_by: null,
  sent_at: null,
  received_by: null,
  received_at: null,
  created_at: '2026-07-29T00:00:00.000Z',
  item_name: 'Test Paper A4',
  item_sku: 'PAP-A4',
  from_branch_name: 'Branch One',
  from_branch_short_name: 'B1',
  to_branch_name: 'Branch Two',
  to_branch_short_name: 'B2',
  created_by_name: 'Staff One',
  resolved_by_name: null,
  sent_by_name: null,
  received_by_name: null
};

beforeAll(() => {
  const jwt = require('jsonwebtoken');
  adminToken = jwt.sign({
    id: 1, user_id: 'admin', role: 'Admin', branch_id: null,
    sub: '1', branch: null, permissions: []
  }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });

  staffBranch1Token = jwt.sign({
    id: 2, user_id: 'staff1', role: 'Front Office', branch_id: 1,
    sub: '2', branch: 1, permissions: []
  }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });

  staffBranch2Token = jwt.sign({
    id: 3, user_id: 'staff2', role: 'Front Office', branch_id: 2,
    sub: '3', branch: 2, permissions: []
  }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });
});

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation((sql, params) => {
    const upperSql = String(sql).toUpperCase();
    if (upperSql.includes('SELECT DATABASE()')) {
      return Promise.resolve([[{ db: 'sarga_test' }]]);
    }
    if (upperSql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return Promise.resolve([[{ COLUMN_NAME: 'reserved_quantity' }]]);
    }
    if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF WHERE ID = ?')) {
      const userId = params[0];
      if (userId === 2) return Promise.resolve([[{ branch_id: 1 }]]);
      if (userId === 3) return Promise.resolve([[{ branch_id: 2 }]]);
      return Promise.resolve([[]]);
    }
    if (upperSql.includes('SARGA_USER_SESSIONS') && upperSql.includes('IS_REVOKED')) {
      return Promise.resolve([[]]);
    }
    if (upperSql.includes('FROM SARGA_STOCK_REQUESTS')) {
      return Promise.resolve([[sampleRequest]]);
    }
    return Promise.resolve([[]]);
  });
});

describe('Stock Requests API', () => {
  describe('GET /api/stock-requests', () => {
    it('lists all requests for Admin', async () => {
      const res = await request(app)
        .get('/api/stock-requests')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(10);
    });

    it('lists only branch-specific requests for branch staff', async () => {
      const res = await request(app)
        .get('/api/stock-requests')
        .set('Authorization', `Bearer ${staffBranch1Token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/stock-requests');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/stock-requests', () => {
    it('creates a new stock request successfully', async () => {
      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 1 }]]);
        }
        if (upperSql.includes('FROM SARGA_INVENTORY WHERE ID = ?')) {
          return Promise.resolve([[{ id: 1, name: 'Test Paper A4' }]]);
        }
        if (upperSql.includes('FROM SARGA_BRANCHES WHERE ID = ?')) {
          return Promise.resolve([[{ id: 2, name: 'Branch Two' }]]);
        }
        if (upperSql.includes('FROM SARGA_BRANCH_STOCK WHERE')) {
          return Promise.resolve([[{ quantity: 10 }]]);
        }
        if (upperSql.includes('INSERT INTO SARGA_STOCK_REQUESTS')) {
          return Promise.resolve([{ insertId: 101 }]);
        }
        return Promise.resolve([[]]);
      });

      const res = await request(app)
        .post('/api/stock-requests')
        .set('Authorization', `Bearer ${staffBranch1Token}`)
        .send({
          inventory_item_id: 1,
          to_branch_id: 2,
          quantity: 5,
          notes: 'Test request'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 101);
      expect(res.body.message).toBe('Stock request submitted');
    });

    it('rejects if source branch has insufficient stock', async () => {
      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 1 }]]);
        }
        if (upperSql.includes('FROM SARGA_INVENTORY WHERE ID = ?')) {
          return Promise.resolve([[{ id: 1, name: 'Test Paper A4' }]]);
        }
        if (upperSql.includes('FROM SARGA_BRANCHES WHERE ID = ?')) {
          return Promise.resolve([[{ id: 2, name: 'Branch Two' }]]);
        }
        if (upperSql.includes('FROM SARGA_BRANCH_STOCK WHERE')) {
          return Promise.resolve([[{ quantity: 3 }]]);
        }
        return Promise.resolve([[]]);
      });

      const res = await request(app)
        .post('/api/stock-requests')
        .set('Authorization', `Bearer ${staffBranch1Token}`)
        .send({
          inventory_item_id: 1,
          to_branch_id: 2,
          quantity: 5
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Not enough stock');
    });

    it('rejects requesting from own branch', async () => {
      const res = await request(app)
        .post('/api/stock-requests')
        .set('Authorization', `Bearer ${staffBranch1Token}`)
        .send({
          inventory_item_id: 1,
          to_branch_id: 1,
          quantity: 5
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Cannot request stock from your own branch');
    });
  });

  describe('PUT /api/stock-requests/:id/approve', () => {
    it('approves a request by source branch staff', async () => {
      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('FROM SARGA_STOCK_REQUESTS WHERE ID = ?')) {
          return Promise.resolve([[sampleRequest]]);
        }
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 2 }]]);
        }
        if (upperSql.includes('UPDATE SARGA_STOCK_REQUESTS')) {
          return Promise.resolve([{ affectedRows: 1 }]);
        }
        return Promise.resolve([[]]);
      });

      const res = await request(app)
        .put('/api/stock-requests/10/approve')
        .set('Authorization', `Bearer ${staffBranch2Token}`)
        .send({ action: 'approve' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Request approved');
    });

    it('rejects approval if user is from other branch and not admin', async () => {
      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('FROM SARGA_STOCK_REQUESTS WHERE ID = ?')) {
          return Promise.resolve([[sampleRequest]]);
        }
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 1 }]]);
        }
        return Promise.resolve([[]]);
      });

      const res = await request(app)
        .put('/api/stock-requests/10/approve')
        .set('Authorization', `Bearer ${staffBranch1Token}`)
        .send({ action: 'approve' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/stock-requests/:id/send', () => {
    it('dispatches the stock and updates source stock level', async () => {
      const mockRequestApproved = { ...sampleRequest, status: 'Approved' };
      const mockConnection = {
        query: jest.fn().mockImplementation((sql, params) => {
          const upperSql = String(sql).toUpperCase();
          if (upperSql.includes('SELECT QUANTITY FROM SARGA_BRANCH_STOCK')) {
            return Promise.resolve([[{ quantity: 10 }]]);
          }
          return Promise.resolve([[]]);
        }),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };

      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('FROM SARGA_STOCK_REQUESTS WHERE ID = ?')) {
          return Promise.resolve([[mockRequestApproved]]);
        }
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 2 }]]);
        }
        return Promise.resolve([[]]);
      });

      pool.getConnection.mockResolvedValue(mockConnection);

      const res = await request(app)
        .put('/api/stock-requests/10/send')
        .set('Authorization', `Bearer ${staffBranch2Token}`);

      expect(res.status).toBe(200);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(res.body.message).toContain('Stock sent');
    });
  });

  describe('PUT /api/stock-requests/:id/receive', () => {
    it('receives the stock and adds to destination branch stock', async () => {
      const mockRequestSent = { ...sampleRequest, status: 'Sent' };
      const mockConnection = {
        query: jest.fn().mockResolvedValue([[]]),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };

      pool.query.mockImplementation((sql, params) => {
        const upperSql = String(sql).toUpperCase();
        if (upperSql.includes('FROM SARGA_STOCK_REQUESTS WHERE ID = ?')) {
          return Promise.resolve([[mockRequestSent]]);
        }
        if (upperSql.includes('SELECT BRANCH_ID FROM SARGA_STAFF')) {
          return Promise.resolve([[{ branch_id: 1 }]]);
        }
        return Promise.resolve([[]]);
      });

      pool.getConnection.mockResolvedValue(mockConnection);

      const res = await request(app)
        .put('/api/stock-requests/10/receive')
        .set('Authorization', `Bearer ${staffBranch1Token}`);

      expect(res.status).toBe(200);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(res.body.message).toContain('Stock received');
    });
  });
});
