const { pool } = require('../database');
(async () => {
  try {
    const [users] = await pool.query('SELECT * FROM sarga_staff LIMIT 5');
    console.log(users);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
