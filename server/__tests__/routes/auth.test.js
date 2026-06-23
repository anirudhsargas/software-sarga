const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const mockQuery = jest.fn();
jest.mock('../../database', () => {
  const mockPool = {
    query: (...args) => mockQuery(...args),
    getConnection: jest.fn(() => ({ release: jest.fn() })),
  };
  return { pool: mockPool, initDb: jest.fn(() => Promise.resolve()) };
});

jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn(),
}));

jest.mock('../../helpers', () => ({
  normalizeMobileWithCountry: jest.fn((v) => v || ''),
  auditLog: jest.fn(),
  getTodayDate: jest.fn(() => '2025-01-15'),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn(() => ({ id: 1, role: 'Admin' })),
}));

describe('Auth Routes', () => {
  let app;

  beforeAll(() => {
    const { TEST_JWT_SECRET } = require('../helpers/testUtils');
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.NODE_ENV = 'test';
    app = require('../../index');
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('POST /api/auth/login', () => {
    const validUser = {
      id: 1, user_id: 'admin', name: 'Admin', role: 'Admin',
      password: bcrypt.hashSync('Admin@123', 10),
      branch_id: 1, is_first_login: 0, image_url: null, settings: null,
      branch_short_name: 'PBR',
    };

    it('returns 200 with token for valid credentials', async () => {
      mockQuery.mockResolvedValueOnce([[validUser]]);
      mockQuery.mockResolvedValueOnce([{}]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'admin', password: 'Admin@123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('mock-jwt-token');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.name).toBe('Admin');
    });

    it('returns 401 for invalid user', async () => {
      mockQuery.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'unknown', password: 'any' });

      expect(res.status).toBe(401);
    });

    it('returns 401 for wrong password', async () => {
      mockQuery.mockResolvedValueOnce([[validUser]]);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'admin', password: 'WrongPass1!' });

      expect(res.status).toBe(401);
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'admin' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockQuery.mockResolvedValueOnce([[]]);
      mockQuery.mockResolvedValueOnce([{}]);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
    });
  });
});
