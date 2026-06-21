const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app, generateTestToken, insertTestBranch, insertTestStaff, cleanTestData, testPool } = require('./setup');

describe('Auth Endpoints', () => {
  let branchId;
  let staffId;

  beforeAll(async () => {
    await cleanTestData();
    branchId = await insertTestBranch({ name: 'Auth Branch', short_name: 'AUTH' });
    staffId = await insertTestStaff({ user_id: 'auth001', name: 'Auth User', role: 'Admin', password: 'Test@1234', branch_id: branchId });
  });

  describe('POST /api/auth/login', () => {
    test('successful login returns token and user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'auth001', password: 'Test@1234' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id', staffId);
      expect(res.body.user).toHaveProperty('role', 'Admin');
      expect(res.body.user).toHaveProperty('name', 'Auth User');
      expect(typeof res.body.token).toBe('string');
    });

    test('invalid credentials return 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ user_id: 'auth001', password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    test('missing fields return 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Token validation', () => {
    test('valid token allows access to protected route', async () => {
      const token = generateTestToken({ id: staffId, role: 'Admin' });
      const res = await request(app)
        .get('/api/staff/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', staffId);
    });

    test('protected route rejects request without token', async () => {
      const res = await request(app).get('/api/staff/me');
      expect(res.status).toBe(401);
    });

    test('protected route rejects invalid token', async () => {
      const res = await request(app)
        .get('/api/staff/me')
        .set('Authorization', 'Bearer invalid-token-here');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('logout revokes session and returns success', async () => {
      const token = generateTestToken({ id: staffId, role: 'Admin' });
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});
