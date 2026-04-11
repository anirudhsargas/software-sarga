const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, ssl: { rejectUnauthorized: false }
  });
  const [tables] = await c.query('SHOW TABLES');
  console.log('Tables:', tables.length);
  tables.forEach(t => console.log(' ', Object.values(t)[0]));
  if (tables.length > 0) {
    const [users] = await c.query('SELECT id, username, role FROM users LIMIT 5');
    console.log('Users:', JSON.stringify(users));
  }
  await c.end();
})().catch(e => console.error('ERR:', e.message));
