const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: 'db-sarga-software-sarga.b.aivencloud.com', port: 14194,
    user: 'avnadmin', password: 'AVNS_jDVLMVrQKCxNOu--B7n',
    database: 'defaultdb', ssl: { rejectUnauthorized: false }
  });
  const [jobs] = await c.query('SELECT COUNT(*) as cnt FROM sarga_jobs');
  const [active] = await c.query("SELECT COUNT(*) as cnt FROM sarga_jobs WHERE status NOT IN ('delivered','cancelled')");
  const [completed] = await c.query("SELECT COUNT(*) as cnt FROM sarga_jobs WHERE status = 'ready'");
  const [cols] = await c.query("SHOW COLUMNS FROM sarga_jobs LIKE '%due%'");
  console.log('Due columns:', cols.map(c=>c.Field));
  const [due] = await c.query('SELECT SUM(total_amount) as total FROM sarga_jobs');
  console.log('Total jobs:', jobs[0].cnt);
  console.log('Active jobs:', active[0].cnt);
  console.log('Ready/completed:', completed[0].cnt);
  console.log('Total due:', due[0].total);
  await c.end();
})().catch(e => console.error(e.message));
