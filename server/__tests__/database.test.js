jest.mock('mysql2/promise', () => {
  const mockConnection = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    getConnection: jest.fn().mockResolvedValue(mockConnection),
    query: jest.fn(),
  };
  return { createPool: jest.fn(() => mockPool) };
});

jest.mock('fs');
jest.mock('path');

describe('database module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates pool and exports it', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(false);
    const mysql = require('mysql2/promise');
    const db = require('../database');
    expect(db).toHaveProperty('pool');
    expect(db).toHaveProperty('initDb');
    expect(mysql.createPool).toHaveBeenCalled();
  });

  it('initDb runs schema files and releases connection', async () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_core.sql', '002_inventory.sql'].sort());
    fs.readFileSync
      .mockReturnValueOnce('CREATE TABLE test (id INT); SELECT 1;')
      .mockReturnValueOnce('CREATE TABLE inv (id INT);');

    const db = require('../database');
    const { pool } = db;
    const conn = await pool.getConnection();

    await db.initDb();

    expect(conn.query).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('throws on schema error', async () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['bad.sql']);
    fs.readFileSync.mockReturnValue('INVALID SQL;');

    const db = require('../database');
    const { pool } = db;
    const conn = await pool.getConnection();
    conn.query.mockRejectedValueOnce(new Error('ER_PARSE_ERROR'));

    await expect(db.initDb()).rejects.toThrow();
    expect(conn.release).toHaveBeenCalled();
  });

  it('builds SSL config when DB_SSL is true', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_HOST = 'test-host';
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('fake-cert');

    jest.resetModules();
    require('../database');
    const mysql = require('mysql2/promise');
    const config = mysql.createPool.mock.calls[0][0];
    expect(config).toHaveProperty('ssl');
    expect(config.ssl.rejectUnauthorized).toBe(true);

    delete process.env.DB_SSL;
  });
});
