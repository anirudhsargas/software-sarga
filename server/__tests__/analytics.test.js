const request = require('supertest');
const { app, generateTestToken, insertTestBranch, insertTestStaff, cleanTestData } = require('./setup');

describe('Analytics Endpoints', () => {
  let adminToken;
  let branchId;

  beforeAll(async () => {
    await cleanTestData();
    branchId = await insertTestBranch({ name: 'Analytics Branch', short_name: 'ANL' });
    const staffId = await insertTestStaff({ user_id: 'anladmin', name: 'Analytics Admin', role: 'Admin', password: 'Test@1234', branch_id: branchId });
    adminToken = generateTestToken({ id: staffId, role: 'Admin', branch_id: branchId });
  });

  test('GET /api/dashboard-init returns expected shape', async () => {
    const res = await request(app)
      .get('/api/dashboard-init')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pendingCount');
    expect(typeof res.body.pendingCount).toBe('number');
    expect(res.body).toHaveProperty('companySettings');
    expect(typeof res.body.companySettings).toBe('object');
    expect(res.body).toHaveProperty('anomalyCount');
    expect(typeof res.body.anomalyCount).toBe('number');
  });

  test('GET /api/vendors/dashboard/stats returns expected shape', async () => {
    const res = await request(app)
      .get('/api/vendors/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total_vendors');
    expect(res.body.data).toHaveProperty('this_month_spend');
    expect(res.body.data).toHaveProperty('pending_amount');
    expect(res.body.data).toHaveProperty('overdue_amount');
    expect(res.body.data).toHaveProperty('top_vendors');
    expect(res.body.data).toHaveProperty('pending_invoices');
    expect(res.body.data).toHaveProperty('monthly_trend');
    expect(Array.isArray(res.body.data.top_vendors)).toBe(true);
    expect(Array.isArray(res.body.data.pending_invoices)).toBe(true);
    expect(Array.isArray(res.body.data.monthly_trend)).toBe(true);
  });

  test('GET /api/server-time returns expected shape', async () => {
    const res = await request(app).get('/api/server-time');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('iso');
    expect(res.body).toHaveProperty('date');
    expect(res.body).toHaveProperty('month');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.iso).toISOString()).toBe(res.body.iso);
  });
});
