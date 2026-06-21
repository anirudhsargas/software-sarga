const request = require('supertest');

jest.mock('../database');
jest.mock('../middleware/validate');
jest.mock('../helpers/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('node-cache');
jest.mock('../helpers/cloudinaryUpload', () => ({ cloudinary: {}, getCloudinaryUrl: jest.fn() }));
jest.mock('axios');

const axios = require('axios');
const { mockPool, mockConnection, setupMockPool, mockQueryResult } = require('./helpers/mockDb');
const { generateToken } = require('./__mocks__/middleware/auth');

let app;
let adminToken;

beforeEach(() => {
  jest.resetModules();
  setupMockPool();
  app = require('../index');
  adminToken = generateToken({ id: 1, role: 'Admin' });
});

describe('Stock Planning API', () => {
  it('GET /api/ai/stock-planning/stock-status returns mock data when ML unavailable', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));

    mockPool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT cache_value')) return [[]];
      if (sql.includes('SELECT COUNT(*) as count')) return [mockQueryResult({ count: 5 })];
      if (sql.includes('FROM sarga_inventory')) return [mockQueryResult([{ id: 1, name: 'Paper', category: 'Offset', unit: 'ream', quantity: 10 }])];
      return [[]];
    });

    const res = await request(app)
      .get('/api/ai/stock-planning/stock-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stock_status');
    expect(Array.isArray(res.body.stock_status)).toBe(true);
    expect(res.body).toHaveProperty('generated_at');
  });

  it('GET /api/ai/stock-planning/purchase-list returns expected shape', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));

    mockPool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT cache_value')) return [[]];
      if (sql.includes('SELECT COUNT(*) as count')) return [mockQueryResult({ count: 5 })];
      if (sql.includes('FROM sarga_inventory')) return [mockQueryResult([{ id: 1, name: 'Ink', category: 'Consumable', unit: 'litre', quantity: 2 }])];
      return [[]];
    });

    const res = await request(app)
      .get('/api/ai/stock-planning/purchase-list')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('purchase_list');
    expect(res.body).toHaveProperty('total_estimated_cost');
  });

  it('POST /api/ai/stock-planning/approve-purchase-list requires items array', async () => {
    const res = await request(app)
      .post('/api/ai/stock-planning/approve-purchase-list')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/ai/stock-planning/approve-purchase-list creates purchase order', async () => {
    mockConnection.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO sarga_purchase_orders')) return [mockQueryResult({ insertId: 55 })];
      if (sql.includes('INSERT INTO sarga_purchase_order_items')) return [mockQueryResult({ insertId: 1 })];
      return [[]];
    });
    mockPool.getConnection.mockResolvedValue(mockConnection);

    const res = await request(app)
      .post('/api/ai/stock-planning/approve-purchase-list')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ material_id: 1, suggested_qty: 10, unit: 'pcs', estimated_cost: 500, urgency: 'critical' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('order_id');
  });

  it('GET /api/paperInventory/stock-test returns ok', async () => {
    const res = await request(app).get('/api/paperInventory/stock-test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
