const request = require('supertest');
const { app, generateTestToken, insertTestBranch, insertTestStaff, cleanTestData, testPool } = require('./setup');

describe('Customers & Orders', () => {
  let adminToken;
  let branchId;

  beforeAll(async () => {
    await cleanTestData();
    branchId = await insertTestBranch({ name: 'Customer Branch', short_name: 'CUS' });
    const staffId = await insertTestStaff({ user_id: 'cusadmin', name: 'Cust Admin', role: 'Admin', password: 'Test@1234', branch_id: branchId });
    adminToken = generateTestToken({ id: staffId, role: 'Admin', branch_id: branchId });
  });

  describe('POST /api/customers', () => {
    test('creates a customer', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Customer', mobile: '9876543210', type: 'Walk-in' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'Test Customer');
    });

    test('rejects duplicate mobile', async () => {
      await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'First Customer', mobile: '9876543222', type: 'Walk-in' });
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate Customer', mobile: '9876543222', type: 'Walk-in' });
      expect(res.status).toBe(409);
    });

    test('rejects without auth', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({ name: 'No Auth', mobile: '9876543333', type: 'Walk-in' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/customers', () => {
    test('lists customers with pagination shape', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('search filters customers', async () => {
      const res = await request(app)
        .get('/api/customers?search=Test')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /api/customers/:id', () => {
    test('returns single customer', async () => {
      const created = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Detail Customer', mobile: '9876544444', type: 'Walk-in' });
      const res = await request(app)
        .get(`/api/customers/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Detail Customer');
    });

    test('returns 404 for non-existent customer', async () => {
      const res = await request(app)
        .get('/api/customers/99999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Order creation links customer to job', () => {
    test('creates order and links to job', async () => {
      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Order Customer', mobile: '9876545555', type: 'Walk-in' });
      const customerId = custRes.body.id;

      const jobRes = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: customerId,
          branch_id: branchId,
          job_name: 'Linked Order Job',
          quantity: 500,
          total_amount: 2500,
          advance_paid: 0,
          category: 'Offset',
        });
      expect(jobRes.status).toBe(201);
      expect(jobRes.body).toHaveProperty('job_number');

      const [[job]] = await testPool.query(
        'SELECT customer_id, job_name FROM sarga_jobs WHERE id = ?',
        [jobRes.body.id]
      );
      expect(job.customer_id).toBe(customerId);
      expect(job.job_name).toBe('Linked Order Job');
    });
  });
});
