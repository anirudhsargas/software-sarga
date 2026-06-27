const request = require('supertest');
const { app, generateTestToken, insertTestBranch, insertTestStaff, insertTestVendor, cleanTestData, testPool } = require('./setup');

describe('Vendor Management', () => {
  let adminToken;
  let branchId;

  beforeAll(async () => {
    await cleanTestData();
    branchId = await insertTestBranch({ name: 'Vendor Branch', short_name: 'VDR' });
    const staffId = await insertTestStaff({ user_id: 'vendoradmin', name: 'Vendor Admin', role: 'Admin', password: 'Test@1234', branch_id: branchId });
    adminToken = generateTestToken({ id: staffId, role: 'Admin', branch_id: branchId });
  });

  describe('POST /api/vendors', () => {
    test('creates vendor with auto-generated 3-letter code from name', async () => {
      const res = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Supreme Paper Mills', category: 'paper', type: 'Vendor' });
      if (res.status !== 200) console.log('DEBUG VENDORS TEST 401 BODY:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('vendor_code');
      expect(res.body.data.vendor_code).toMatch(/^[A-Z]{3}$/);
      expect(res.body.data.vendor_code).toBe('SUP');
    });

    test('creates vendor and pads short name to 3 chars', async () => {
      const res = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'AB', category: 'ink', type: 'Vendor' });
      expect(res.status).toBe(200);
      expect(res.body.data.vendor_code).toMatch(/^[A-Z]{3}$/);
    });

    test('rejects duplicate vendor name', async () => {
      await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Unique Vendor', category: 'other' });
      const res = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Unique Vendor', category: 'other' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    test('rejects without auth token', async () => {
      const res = await request(app)
        .post('/api/vendors')
        .send({ name: 'No Auth Vendor', category: 'other' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/vendors', () => {
    test('lists vendors with success shape', async () => {
      const res = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/vendors/:id', () => {
    test('returns vendor details with invoices and payments', async () => {
      const vendorId = await insertTestVendor({ name: 'Detail Vendor', vendor_code: 'DTL' });
      const res = await request(app)
        .get(`/api/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Detail Vendor');
      expect(res.body.data).toHaveProperty('total_spend');
      expect(res.body.data).toHaveProperty('invoices');
      expect(res.body.data).toHaveProperty('payments');
      expect(res.body.data).toHaveProperty('total_invoices');
    });

    test('returns 404 for non-existent vendor', async () => {
      const res = await request(app)
        .get('/api/vendors/99999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Vendor Bill Upload', () => {
    test('POST /api/vendor-invoices creates an invoice', async () => {
      const vendorId = await insertTestVendor({ name: 'Invoice Vendor', vendor_code: 'INV' });
      const res = await request(app)
        .post('/api/vendor-invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendor_id: vendorId,
          invoice_number: 'INV-001',
          invoice_date: '2026-06-01',
          amount: 5000,
          branch: 'common',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  describe('Statement Reconciliation', () => {
    test('POST /api/vendor-statements/:id/reconcile returns structured result', async () => {
      const vendorId = await insertTestVendor({ name: 'Recon Vendor', vendor_code: 'REC' });
      const [statement] = await testPool.query(
        `INSERT INTO vendor_statements (vendor_id, statement_month, file_name, file_path) VALUES (?, ?, ?, ?)`,
        [vendorId, '2026-06', 'test.csv', '/tmp/test.csv']
      );
      const res = await request(app)
        .post(`/api/vendor-statements/${statement.insertId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('matched');
      expect(res.body.data).toHaveProperty('partial');
      expect(res.body.data).toHaveProperty('unmatched');
    });
  });
});
