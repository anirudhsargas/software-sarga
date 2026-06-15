const { pool } = require('../database');
(async () => {
  try {
    const [vendors] = await pool.query('SELECT COUNT(*) as count FROM vendors');
    const [sargaVendors] = await pool.query('SELECT COUNT(*) as count FROM sarga_vendors');
    console.log('vendors count:', vendors[0].count);
    console.log('sarga_vendors count:', sargaVendors[0].count);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
