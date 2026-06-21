const request = require('supertest');

jest.mock('../database', () => {
  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(),
    end: jest.fn(),
  };
  return { pool: mockPool, initDb: jest.fn().mockResolvedValue() };
});

const app = require('../index');

describe('GET /api/server-time', () => {
  it('returns server time with ISO date and timestamp', async () => {
    const before = Date.now();
    const res = await request(app).get('/api/server-time');
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('debug_marker', 'paper-inventory-debug-v1');
    expect(res.body).toHaveProperty('iso');
    expect(res.body).toHaveProperty('date');
    expect(res.body).toHaveProperty('month');
    expect(res.body).toHaveProperty('timestamp');

    expect(res.body.timestamp).toBeGreaterThanOrEqual(before);
    expect(res.body.timestamp).toBeLessThanOrEqual(after);

    const isoDate = new Date(res.body.iso);
    expect(isoDate.getTime()).toBeGreaterThan(0);
  });

  it('returns date in YYYY-MM-DD format', async () => {
    const res = await request(app).get('/api/server-time');
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns month in YYYY-MM format', async () => {
    const res = await request(app).get('/api/server-time');
    expect(res.body.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
