const request = require('supertest');
const { pool } = require('../database');

jest.mock('../database');

const app = require('../index');
const { generateToken, makeAuthHeader } = require('./helpers/setup');

const adminToken = generateToken();

describe('Products Routes', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
    if (pool.getConnection && pool.getConnection.mock) {
      pool.getConnection.mockReset();
      const mockConnection = {
        query: pool.query,
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      pool.getConnection.mockResolvedValue(mockConnection);
    }
  });

  describe('GET /api/product-categories', () => {
    it('lists product categories', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Books', position: 1, is_active: true }]]);
      const res = await request(app)
        .get('/api/product-categories')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/product-categories', () => {
    it('creates a category', async () => {
      pool.query
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .post('/api/product-categories')
        .set(makeAuthHeader(adminToken))
        .send({ name: 'New Category' });
      expect(res.status).toBe(201);
    });

    it('rejects empty name', async () => {
      const res = await request(app)
        .post('/api/product-categories')
        .set(makeAuthHeader(adminToken))
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/product-categories/:id/subcategories', () => {
    it('lists subcategories', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, category_id: 1, name: 'Notebooks', is_active: true }]]);
      const res = await request(app)
        .get('/api/product-categories/1/subcategories')
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

  describe('DELETE /api/product-categories/:id', () => {
    it('deletes a category', async () => {
      pool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]]);
      const res = await request(app)
        .delete('/api/product-categories/1')
        .set(makeAuthHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/products', () => {
    it('rejects duplicate product in the same company', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('sarga_products') && !sql.includes('INSERT')) {
          return Promise.resolve([[{ id: 10 }]]);
        }
        return Promise.resolve([[]]);
      });
      const res = await request(app)
        .post('/api/products')
        .set(makeAuthHeader(adminToken))
        .send({
          subcategory_id: 1,
          name: 'Visiting Card',
          company_name: 'Canon'
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('creates product if not duplicate', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('sarga_products') && !sql.includes('INSERT') && !sql.includes('MAX')) {
          return Promise.resolve([[]]);
        }
        if (sql.includes('MAX(position)') || sql.includes('nextPos')) {
          return Promise.resolve([[{ nextPos: 1 }]]);
        }
        if (sql.includes('INSERT INTO sarga_products')) {
          return Promise.resolve([{ insertId: 100 }]);
        }
        return Promise.resolve([[]]);
      });
      const res = await request(app)
        .post('/api/products')
        .set(makeAuthHeader(adminToken))
        .send({
          subcategory_id: 1,
          name: 'Visiting Card',
          company_name: 'Canon'
        });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('rejects duplicate product update in the same company', async () => {
      pool.query.mockImplementation((sql, params) => {
        if (sql.includes('SELECT * FROM sarga_products WHERE id = ?')) {
          return Promise.resolve([[{ id: 1, name: 'Brochure', company_name: 'Canon' }]]);
        }
        if (sql.includes('sarga_products') && sql.includes('LOWER(TRIM(name))')) {
          return Promise.resolve([[{ id: 2 }]]);
        }
        return Promise.resolve([[]]);
      });
      const res = await request(app)
        .put('/api/products/1')
        .set(makeAuthHeader(adminToken))
        .send({
          name: 'Visiting Card',
          company_name: 'Canon'
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });
});
