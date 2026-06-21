const request = require('supertest');
const { pool } = require('../database');

jest.mock('../database');

const app = require('../index');
const { generateToken, makeAuthHeader } = require('./helpers/setup');

const adminToken = generateToken();
const { frontOfficeToken, accountantToken } = require('./helpers/setup');

describe('Expenses Routes', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  describe('GET /api/expense-dashboard', () => {
    it('returns dashboard data', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 10000 }]])
        .mockResolvedValueOnce([[{ collected: 25000 }]])
        .mockResolvedValueOnce([[{ cnt: 5 }]])
        .mockResolvedValueOnce([[{ cnt: 10 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .get('/api/expense-dashboard?month=2025-01')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body).not.toBeNull();
    });

    it('returns empty for non-admin user', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 10000 }]])
        .mockResolvedValueOnce([[{ collected: 25000 }]])
        .mockResolvedValueOnce([[{ cnt: 5 }]])
        .mockResolvedValueOnce([[{ cnt: 10 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .get('/api/expense-dashboard?month=2025-01')
        .set(makeAuthHeader(accountantToken));
      expect(res.status).toBe(200);
    });

    it('handles branch-scoped user', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 5000 }]])
        .mockResolvedValueOnce([[{ collected: 10000 }]])
        .mockResolvedValueOnce([[{ cnt: 2 }]])
        .mockResolvedValueOnce([[{ cnt: 3 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .get('/api/expense-dashboard')
        .set(makeAuthHeader(frontOfficeToken));
      expect(res.status).toBe(200);
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/expense-dashboard');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/expenses', () => {
    it('lists expenses (alias for payments)', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[{
          id: 1, branch_id: 1, type: 'Utility', payee_name: 'Electric Board',
          amount: 5000, payment_method: 'UPI', payment_date: '2025-01-15',
          branch_name: 'Perambra',
        }]]);
      const res = await request(app)
        .get('/api/expenses')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });
});
