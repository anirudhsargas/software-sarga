const request = require('supertest');
const { pool } = require('../database');

jest.mock('../database');

const app = require('../index');
const { generateToken, makeAuthHeader } = require('./helpers/setup');

const adminToken = generateToken();

describe('Products Routes', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  describe('GET /api/products/categories', () => {
    it('lists product categories', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Books', position: 1, is_active: true }]]);
      const res = await request(app)
        .get('/api/products/categories')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/products/categories', () => {
    it('creates a category', async () => {
      pool.query
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/products/categories')
        .set(makeAuthHeader(adminToken))
        .send({ name: 'New Category' });
      expect(res.status).toBe(201);
    });

    it('rejects empty name', async () => {
      const res = await request(app)
        .post('/api/products/categories')
        .set(makeAuthHeader(adminToken))
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/subcategories', () => {
    it('lists subcategories', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, category_id: 1, name: 'Notebooks', is_active: true }]]);
      const res = await request(app)
        .get('/api/products/subcategories')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/products', () => {
    it('lists products with hierarchy', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 1, name: 'A4 Notebook' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Books', position: 1, image_url: null, is_active: true, created_at: '' }]])
        .mockResolvedValueOnce([[{ id: 1, category_id: 1, name: 'Notebooks', position: 1, image_url: null, is_active: true, created_at: '' }]])
        .mockResolvedValueOnce([[{ id: 1, subcategory_id: 1, name: 'A4 Notebook', product_code: 'NB-A4', company_name: '', company_code: '', size: '', calculation_type: 'quantity', description: '', image_url: null, has_paper_rate: 0, paper_rate: null, has_double_side_rate: 0, position: 1, inventory_item_id: null, is_physical_product: 1, is_active: true, created_at: '', updated_at: '' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .get('/api/products')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/products/categories/:id', () => {
    it('deletes a category', async () => {
      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .delete('/api/products/categories/1')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });
});
