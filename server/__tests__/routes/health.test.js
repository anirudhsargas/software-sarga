const request = require('supertest');

jest.mock('../../database', () => {
  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(() => ({ release: jest.fn() })),
  };
  return { pool: mockPool, initDb: jest.fn(() => Promise.resolve()) };
});

jest.mock('../../helpers/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), log: jest.fn(),
}));

describe('Health & Ping Endpoints', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars-long!!';
    process.env.NODE_ENV = 'test';
    app = require('../../index');
  });

  describe('GET /api/health', () => {
    it('returns 200 when DB is connected', async () => {
      const { pool } = require('../../database');
      pool.query.mockResolvedValueOnce([[{ ok: 1 }]]);

      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.service).toBe('sarga-mis');
    });

    it('returns 503 when DB is down', async () => {
      const { pool } = require('../../database');
      pool.query.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(app).get('/api/health');
      expect(res.status).toBe(503);
      expect(res.body.database).toBe('error');
    });
  });

  describe('GET /api/ping', () => {
    it('returns 200 with DB connected', async () => {
      const { pool } = require('../../database');
      pool.query.mockResolvedValueOnce([[{ 1: 1 }]]);

      const res = await request(app).get('/api/ping');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('returns 503 when DB fails', async () => {
      const { pool } = require('../../database');
      pool.query.mockRejectedValueOnce(new Error('fail'));

      const res = await request(app).get('/api/ping');
      expect(res.status).toBe(503);
    });
  });

  describe('GET /api/server-time', () => {
    it('returns server time data', async () => {
      const res = await request(app).get('/api/server-time');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('iso');
      expect(res.body).toHaveProperty('date');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.debug_marker).toBe('paper-inventory-debug-v1');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent-route');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});
