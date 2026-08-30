const { pool } = require('./database');
async function test() {
  try {
    const [products] = await pool.query("SELECT id, name, size FROM sarga_products WHERE size IS NOT NULL AND size != '' LIMIT 10");
    console.log('Sample products with size:', products);

    const [jobs] = await pool.query("SELECT id, job_name, paper_size, quantity FROM sarga_jobs WHERE paper_size IS NOT NULL AND paper_size != '' LIMIT 10");
    console.log('Sample jobs with paper_size:', jobs);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
