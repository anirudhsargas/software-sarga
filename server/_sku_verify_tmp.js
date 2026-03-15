require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
  });
  try {
    const [rows] = await pool.query(`
      SELECT normalized_sku, COUNT(*) AS cnt, GROUP_CONCAT(CONCAT(id, ':', sku) SEPARATOR ' | ') AS examples
      FROM (
        SELECT id, sku, REPLACE(UPPER(TRIM(sku)), ' ', '') AS normalized_sku
        FROM sarga_inventory
        WHERE sku IS NOT NULL AND TRIM(sku) <> ''
      ) t
      GROUP BY normalized_sku
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC, normalized_sku ASC
      LIMIT 20
    `);
    console.log('SKU_NORMALIZATION_COLLISIONS=' + rows.length);
    if (rows.length) console.log(JSON.stringify(rows, null, 2));

    const [spaces] = await pool.query(`
      SELECT id, sku FROM sarga_inventory
      WHERE sku IS NOT NULL AND sku REGEXP '[[:space:]]'
      ORDER BY id DESC
      LIMIT 20
    `);
    console.log('SKUS_WITH_WHITESPACE=' + spaces.length);
    if (spaces.length) console.log(JSON.stringify(spaces, null, 2));
  } catch (e) {
    console.error('SKU_VERIFY_ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
