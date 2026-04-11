const m = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const c = await m.createConnection({
    host: 'db-sarga-software-sarga.b.aivencloud.com', port: 14194,
    user: 'avnadmin', password: 'AVNS_jDVLMVrQKCxNOu--B7n',
    database: 'defaultdb', ssl: { rejectUnauthorized: false }
  });

  // Check what password hash is stored for user 17
  const [rows] = await c.query('SELECT id, user_id, name, password FROM sarga_staff WHERE user_id = ?', ['9048309905']);
  if (rows.length === 0) { console.log('User not found'); await c.end(); return; }

  const user = rows[0];
  console.log('User:', user.id, user.name, 'Hash:', user.password.substring(0, 20) + '...');

  // Test the password
  const testPwd = '9048309905@Sarga';
  const matches = await bcrypt.compare(testPwd, user.password);
  console.log(`Password "${testPwd}" matches: ${matches}`);

  // If doesn't match, reset it
  if (!matches) {
    const newHash = await bcrypt.hash(testPwd, 10);
    await c.query('UPDATE sarga_staff SET password = ? WHERE id = ?', [newHash, user.id]);
    console.log('Password reset to:', testPwd);

    // Verify
    const v = await bcrypt.compare(testPwd, newHash);
    console.log('Verification:', v);
  }

  await c.end();
})().catch(e => console.error(e.message));
