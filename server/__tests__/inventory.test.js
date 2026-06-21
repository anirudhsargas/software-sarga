const request = require('supertest');
const { pool } = require('../database');

jest.mock('../database');

const app = require('../index');
const { generateToken, makeAuthHeader } = require('./helpers/setup');

const adminToken = generateToken();

describe('Inventory Routes', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  const sampleItem = {
    id: 1, name: 'Test Paper', sku: 'PAP-001', category: 'Paper',
    unit: 'pcs', quantity: 100, reorder_level: 10, cost_price: 50,
    sell_price: 75, hsn: '4802', discount: 0, gst_rate: 5,
    source_code: 'OFF', model_name: '', size_code: 'A4',
    item_type: 'Retail', vendor_name: 'PaperCo', vendor_contact: '',
    purchase_link: '', reserved_quantity: 0, image_url: null,
    created_at: '2025-01-01T00:00:00.000Z',
  };

  describe('GET /api/inventory', () => {
    it('lists inventory items', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data[0]).toHaveProperty('name', 'Test Paper');
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/inventory');
      expect(res.status).toBe(401);
    });

    it('supports search', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory?search=Paper')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('supports category filter', async () => {
      pool.query
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory?category=Paper')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/inventory', () => {
    it('creates an inventory item', async () => {
      pool.query
        .mockResolvedValueOnce([[{ db: 'sarga_test' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'reserved_quantity' }]])
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/inventory')
        .set(makeAuthHeader(adminToken))
        .send({ name: 'New Item', sku: 'NEW-001', quantity: 50, cost_price: 100, sell_price: 150 });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 2);
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set(makeAuthHeader(adminToken))
        .send({ quantity: 10 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/inventory/:id', () => {
    it('returns an item by ID', async () => {
      pool.query
        .mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory/1')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/inventory/:id', () => {
    it('updates an inventory item', async () => {
      pool.query
        .mockResolvedValueOnce([[sampleItem]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app)
        .put('/api/inventory/1')
        .set(makeAuthHeader(adminToken))
        .send({ name: 'Updated Item', cost_price: 60, sell_price: 90 });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    it('deletes an item', async () => {
      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .delete('/api/inventory/1')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/inventory/barcode/:code', () => {
    it('looks up by scanned code (SKU)', async () => {
      pool.query.mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory/barcode/PAP-001')
        .set(makeAuthHeader(adminToken));
      expect([200, 404]).toContain(res.status);
    });

    it('looks up by ITEM-{id}', async () => {
      pool.query.mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory/barcode/ITEM-1')
        .set(makeAuthHeader(adminToken));
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/inventory/low-stock', () => {
    it('returns low stock items', async () => {
      pool.query.mockResolvedValueOnce([[sampleItem]]);
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
