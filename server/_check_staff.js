const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: 'db-sarga-software-sarga.b.aivencloud.com', port: 14194,
    user: 'avnadmin', password: 'AVNS_jDVLMVrQKCxNOu--B7n',
    database: 'defaultdb', ssl: { rejectUnauthorized: false }
  });
  const [u] = await c.query('SELECT id, user_id, name, role, is_first_login, LENGTH(password) as pwd_len FROM sarga_staff LIMIT 10');
  console.log(JSON.stringify(u, null, 2));
  await c.end();
})().catch(e => console.error(e.message));
