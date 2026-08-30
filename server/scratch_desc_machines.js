const { pool } = require('./database');
async function test() {
  try {
    const [cols] = await pool.query('DESCRIBE sarga_machines');
    console.log('sarga_machines columns:', cols.map(c => `${c.Field}: ${c.Type}`));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
