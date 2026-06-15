const { pool } = require('../database');
(async () => {
  try {
    const [r] = await pool.query('SELECT * FROM vendors');
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
