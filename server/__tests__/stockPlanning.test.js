const request = require('supertest');
const { app, generateTestToken, insertTestBranch, insertTestStaff, cleanTestData, testPool } = require('./setup');

describe('Stock Planning', () => {
  let adminToken;

  beforeAll(async () => {
    await cleanTestData();
    const branchId = await insertTestBranch({ name: 'Stock Branch', short_name: 'STK' });
    const staffId = await insertTestStaff({ user_id: 'stockadmin', name: 'Stock Admin', role: 'Admin', password: 'Test@1234', branch_id: branchId });
    adminToken = generateTestToken({ id: staffId, role: 'Admin', branch_id: branchId });
  });

  describe('GET /api/ai/stock-planning/stock-status', () => {
    test('returns stock status with correct shape', async () => {
      const res = await request(app)
        .get('/api/ai/stock-planning/stock-status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stock_status');
      expect(Array.isArray(res.body.stock_status)).toBe(true);
      if (res.body.stock_status.length > 0) {
        const item = res.body.stock_status[0];
        expect(item).toHaveProperty('material_id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('current_stock');
        expect(item).toHaveProperty('days_to_stockout');
        expect(item).toHaveProperty('status');
        expect(['ok', 'low', 'critical']).toContain(item.status);
      }
      expect(res.body).toHaveProperty('generated_at');
    });
  });

  describe('GET /api/ai/stock-planning/purchase-list', () => {
    test('returns purchase recommendations with correct shape', async () => {
      const res = await request(app)
        .get('/api/ai/stock-planning/purchase-list')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('purchase_list');
      expect(res.body).toHaveProperty('total_estimated_cost');
      expect(Array.isArray(res.body.purchase_list)).toBe(true);
      if (res.body.purchase_list.length > 0) {
        const item = res.body.purchase_list[0];
        expect(item).toHaveProperty('material_id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('estimated_cost');
      }
      expect(res.body).toHaveProperty('generated_at');
    });
  });

  describe('POST /api/ai/stock-planning/approve-purchase-list', () => {
    test('rejects empty items list', async () => {
      const res = await request(app)
        .post('/api/ai/stock-planning/approve-purchase-list')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items: [] });
      expect(res.status).toBe(400);
    });

    test('rejects without auth', async () => {
      const res = await request(app)
        .post('/api/ai/stock-planning/approve-purchase-list')
        .send({ items: [] });
      expect(res.status).toBe(401);
    });
  });

  describe('Cron alert logic is callable', () => {
    test('scheduler module can be loaded', () => {
      const scheduler = require('../services/scheduler');
      expect(scheduler).toBeDefined();
    });
  });
});
