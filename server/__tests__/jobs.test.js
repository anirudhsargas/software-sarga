const request = require('supertest');
const { app, generateTestToken, insertTestBranch, insertTestStaff, insertTestCustomer, insertTestJob, cleanTestData, testPool } = require('./setup');

describe('Jobs Endpoints', () => {
  let adminToken;
  let branchId;
  let customerId;

  beforeAll(async () => {
    await cleanTestData();
    branchId = await insertTestBranch({ name: 'Job Branch', short_name: 'JOB' });
    const staffId = await insertTestStaff({ user_id: 'jobadmin', name: 'Job Admin', role: 'Admin', password: 'Test@1234', branch_id: branchId });
    adminToken = generateTestToken({ id: staffId, role: 'Admin', branch_id: branchId });
    customerId = await insertTestCustomer({ name: 'Job Customer', mobile: '9876540001' });
  });

  describe('POST /api/jobs', () => {
    test('creates a job and returns id and job_number', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: customerId,
          branch_id: branchId,
          job_name: 'Test Print Job',
          description: '1000 flyers',
          quantity: 1000,
          unit_price: 5,
          total_amount: 5000,
          advance_paid: 1000,
          delivery_date: '2026-07-01',
          category: 'Offset',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('job_number');
      expect(res.body.job_number).toMatch(/^SAR/);
      expect(res.body).toHaveProperty('message', 'Job created successfully');
    });

    test('creates a ₹0-cost internal billing job', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_id: customerId,
          branch_id: branchId,
          job_name: 'Internal Test',
          quantity: 100,
          total_amount: 0,
          advance_paid: 0,
          category: 'Offset',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('job_number');
    });

    test('rejects without job_name', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ total_amount: 100 });
      expect(res.status).toBe(400);
    });

    test('rejects without auth', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ job_name: 'No Auth Job', total_amount: 100 });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/jobs', () => {
    test('lists jobs with paginated shape', async () => {
      await insertTestJob({ customer_id: customerId, branch_id: branchId, job_number: 'JOB-LIST-1' });
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('filters by status', async () => {
      const res = await request(app)
        .get('/api/jobs?status=Completed')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('Job status transitions', () => {
    test('jobs are created with Pending status by default', async () => {
      const jobId = await insertTestJob({ customer_id: customerId, branch_id: branchId, job_number: 'JOB-STATUS-1' });
      const [[job]] = await testPool.query('SELECT status FROM sarga_jobs WHERE id = ?', [jobId]);
      expect(job.status).toBe('Pending');
    });
  });

  describe('PUT /api/jobs/:id - Credit Delivery Override', () => {
    let frontOfficeToken;
    let designerToken;
    let unpaidJobId;
    let fullyPaidJobId;

    beforeEach(async () => {
      // Create tokens for different roles
      frontOfficeToken = generateTestToken({ id: 2, role: 'Front Office', branch_id: branchId });
      designerToken = generateTestToken({ id: 3, role: 'Designer', branch_id: branchId });

      // Insert an unpaid job (balance = 5000)
      unpaidJobId = await insertTestJob({
        customer_id: customerId,
        branch_id: branchId,
        job_number: 'JOB-UNPAID-' + Date.now() + Math.random(),
        total_amount: 5000,
        advance_paid: 0,
        balance_amount: 5000,
        status: 'Completed',
        payment_status: 'Unpaid'
      });

      // Insert a fully paid job (balance = 0)
      fullyPaidJobId = await insertTestJob({
        customer_id: customerId,
        branch_id: branchId,
        job_number: 'JOB-PAID-' + Date.now() + Math.random(),
        total_amount: 5000,
        advance_paid: 5000,
        balance_amount: 0,
        status: 'Completed',
        payment_status: 'Paid'
      });
    });

    test('PUT /jobs/:id with status=Delivered, balance > 0, no credit_override → returns 409', async () => {
      const res = await request(app)
        .put(`/api/jobs/${unpaidJobId}`)
        .set('Authorization', `Bearer ${frontOfficeToken}`)
        .send({
          status: 'Delivered'
        });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Cannot mark as Delivered until full payment is collected');
    });

    test('Same request with credit_override:true but role=Designer → returns 409 (role not allowed)', async () => {
      const res = await request(app)
        .put(`/api/jobs/${unpaidJobId}`)
        .set('Authorization', `Bearer ${designerToken}`)
        .send({
          status: 'Delivered',
          credit_override: true,
          credit_reason: 'Valid override reason'
        });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Cannot mark as Delivered until full payment is collected');
    });

    test('Same request with credit_override:true, role=Front Office, credit_reason="" → returns 409 (reason too short)', async () => {
      const res = await request(app)
        .put(`/api/jobs/${unpaidJobId}`)
        .set('Authorization', `Bearer ${frontOfficeToken}`)
        .send({
          status: 'Delivered',
          credit_override: true,
          credit_reason: 'short'
        });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Cannot mark as Delivered until full payment is collected');
    });

    test('Same request with credit_override:true, role=Front Office, valid reason → succeeds, payment_status=Credit, credit fields populated', async () => {
      const res = await request(app)
        .put(`/api/jobs/${unpaidJobId}`)
        .set('Authorization', `Bearer ${frontOfficeToken}`)
        .send({
          status: 'Delivered',
          credit_override: true,
          credit_reason: 'Valid long enough reason'
        });
      expect(res.status).toBe(200);

      // Verify DB updates
      const [[job]] = await testPool.query('SELECT status, payment_status, credit_authorized_by, credit_authorized_by_name, credit_reason FROM sarga_jobs WHERE id = ?', [unpaidJobId]);
      expect(job.status).toBe('Delivered');
      expect(job.payment_status).toBe('Credit');
      expect(job.credit_authorized_by).toBe(2);
      expect(job.credit_reason).toBe('Valid long enough reason');
      expect(job.credit_authorized_by_name).toBeTruthy();
    });

    test('Confirm a job with balance_amount = 0 can still be marked Delivered normally with no override needed', async () => {
      const res = await request(app)
        .put(`/api/jobs/${fullyPaidJobId}`)
        .set('Authorization', `Bearer ${frontOfficeToken}`)
        .send({
          status: 'Delivered'
        });
      expect(res.status).toBe(200);

      const [[job]] = await testPool.query('SELECT status, payment_status FROM sarga_jobs WHERE id = ?', [fullyPaidJobId]);
      expect(job.status).toBe('Delivered');
      expect(job.payment_status).toBe('Paid');
    });
  });
});
