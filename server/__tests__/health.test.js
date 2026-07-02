const request = require('supertest');
const { app, cleanTestData } = require('./setup');

describe('Health Check', () => {
  beforeAll(async () => {
    await cleanTestData();
  });

  test('GET /api/health returns 200 with correct shape', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
  });

  test('GET /api/ping returns ok and db connected', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('db', 'connected');
  });
});
