const mysql = require('mysql2/promise');

async function run() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'sarga';

  console.log('Connecting to DB', { host: dbHost, user: dbUser, database: dbName });
  const pool = mysql.createPool({ host: dbHost, user: dbUser, password: dbPass, database: dbName, waitForConnections: true, connectionLimit: 10 });

  const connection = await pool.getConnection();
  try {
    // Create a dedicated test inventory row
    const sku = `test-reserve-${Date.now()}`;
    const name = 'Test Reserve Item';
    const [ins] = await connection.query('INSERT INTO sarga_inventory (sku, name, quantity, reserved_quantity) VALUES (?, ?, ?, ?)', [sku, name, 2, 0]);
    const invId = ins.insertId;
    console.log('Created test inventory id', invId);

    const reserveQty = 2;

    async function attemptReserve(label) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        console.log(`${label}: SELECT FOR UPDATE`);
        const [rows] = await conn.query('SELECT quantity, COALESCE(reserved_quantity,0) AS reserved FROM sarga_inventory WHERE id = ? FOR UPDATE', [invId]);
        const quantity = Number(rows[0].quantity || 0);
        const reserved = Number(rows[0].reserved || 0);
        const available = quantity - reserved;
        console.log(`${label}: available=${available}, want=${reserveQty}`);
        if (available < reserveQty) {
          console.log(`${label}: Insufficient available`);
          await conn.rollback();
          return false;
        }
        await conn.query('UPDATE sarga_inventory SET reserved_quantity = COALESCE(reserved_quantity,0) + ? WHERE id = ?', [reserveQty, invId]);
        await conn.commit();
        console.log(`${label}: Reserved successfully`);
        return true;
      } catch (_e) {
        console.error(`${label}: Error`, _e.message || _e);
        try { await conn.rollback(); } catch (_ignored) { /* ignored */ }
        return false;
      } finally {
        conn.release();
      }
    }

    // Fire both attempts in parallel to simulate concurrency
    const p1 = attemptReserve('T1');
    const p2 = attemptReserve('T2');
    const results = await Promise.all([p1, p2]);
    console.log('Results', results);
    const successCount = results.filter(Boolean).length;
    console.log('Success count', successCount);

    if (successCount === 1) {
      console.log('PASS: Concurrency reservation behaved as expected (one succeeded, one failed)');
    } else {
      console.error('FAIL: Concurrency reservation unexpected (expected 1 success)');
    }

    // Cleanup
    await connection.query('DELETE FROM sarga_inventory WHERE id = ?', [invId]);
    await pool.end();

    process.exit(successCount === 1 ? 0 : 2);
  } catch (err) {
    console.error('Test failure:', err.message || err);
    try { await connection.rollback(); } catch (_ignored) { /* ignored */ }
    await pool.end();
    process.exit(3);
  }
}

run();
