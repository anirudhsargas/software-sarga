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
    expect(res.body).toHaveProperty('database', 'connected');
    expect(res.body).toHaveProperty('service', 'sarga-mis');
    expect(res.body).toHaveProperty('time');
    expect(new Date(res.body.time).toISOString()).toBe(res.body.time);
  });

  test('GET /api/ping returns ok and db connected', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('db', 'connected');
  });
});
