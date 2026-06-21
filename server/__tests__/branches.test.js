jest.mock('../database');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../database');

let adminToken;
let staffToken;

beforeAll(() => {
  const jwt = require('jsonwebtoken');
  adminToken = jwt.sign({
    id: 1, user_id: 'admin', role: 'Admin', branch_id: 1,
    sub: '1', branch: 1, permissions: [],
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
  staffToken = jwt.sign({
    id: 2, user_id: 'staff', role: 'Front Office', branch_id: 1,
    sub: '2', branch: 1, permissions: [],
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation((sql) => {
    if (String(sql).includes('sarga_user_sessions') && String(sql).includes('is_revoked')) {
      return Promise.resolve([[]]);
    }
    return Promise.resolve([[]]);
  });
});

describe('GET /api/branches', () => {
  it('lists all branches', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Perambra', short_name: 'PBA' }]]);
    const res = await request(app).get('/api/branches').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe('Perambra');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/branches');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/branches', () => {
  it('creates a branch (admin only)', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 5 }]);
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Branch', address: 'Test Address' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });

  it('rejects non-admin users', async () => {
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'New Branch' });
    expect(res.status).toBe(403);
  });

  it('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/branches/:id', () => {
  it('updates a branch (admin only)', async () => {
    const res = await request(app)
      .put('/api/branches/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Branch' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/branches/:id', () => {
  it('deletes a branch (admin only)', async () => {
    const res = await request(app)
      .delete('/api/branches/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects non-admin users', async () => {
    const res = await request(app)
      .delete('/api/branches/1')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
