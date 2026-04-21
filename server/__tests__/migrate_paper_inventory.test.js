const { migrate, findPaperItems } = require('../migrations/migrate_paper_inventory');

describe('migrate_paper_inventory', () => {
  test('migrates paper-like inventory rows', async () => {
    const mockItems = [{
      id: 101,
      name: 'Offset White 300gsm',
      sku: 'OFF-300-A4',
      category: 'Offset Papers',
      quantity: 50,
      size_code: 'A4',
      source_code: 'OFF',
      cost_price: 120,
      sell_price: 3.5,
      gst_rate: 5,
      vendor_name: 'PaperCo'
    }];

    const calls = [];
    const mockPool = {
      query: jest.fn(async (sql, params) => {
        calls.push({ sql: String(sql), params });
        if (String(sql).includes('FROM sarga_inventory')) {
          return [mockItems];
        }
        if (String(sql).startsWith('CREATE TABLE IF NOT EXISTS sarga_inventory_to_paper_inventory')) {
          return [{}];
        }
        if (String(sql).includes('SELECT id FROM sarga_paper_inventory')) {
          return [[]];
        }
        if (String(sql).startsWith('INSERT INTO sarga_paper_inventory')) {
          return [{ insertId: 999 }];
        }
        if (String(sql).startsWith('INSERT IGNORE INTO sarga_inventory_to_paper_inventory')) {
          return [{}];
        }
        return [[]];
      })
    };

    const result = await migrate({ pool: mockPool });
    expect(result).toHaveProperty('migrated', 1);
    // ensure we attempted to insert into sarga_paper_inventory
    expect(calls.some(c => c.sql.includes('INSERT INTO sarga_paper_inventory'))).toBe(true);
    // ensure mapping table insert was attempted
    expect(calls.some(c => c.sql.includes('INSERT IGNORE INTO sarga_inventory_to_paper_inventory'))).toBe(true);
  });
});
