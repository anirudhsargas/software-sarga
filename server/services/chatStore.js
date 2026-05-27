const fs = require('fs');
const path = require('path');
const { pool } = require('../database');
const logger = require('../helpers/logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHAT_FILE = path.join(DATA_DIR, 'chat_messages.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, '[]', 'utf8');
}

async function saveChat({ uuid, user_message, bot_response, rule_id }) {
  // Prefer DB when available, fall back to file storage
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS sarga_website_chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(50),
        user_message TEXT,
        bot_response TEXT,
        rule_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

    await pool.query(
      `INSERT INTO sarga_website_chat_messages (uuid, user_message, bot_response, rule_id)
       VALUES (?, ?, ?, ?)`,
      [uuid, user_message, bot_response, rule_id || null]
    );

    return { savedTo: 'db' };
  } catch (err) {
    // Write to local file as fallback
    try {
      ensureDataDir();
      const current = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8') || '[]');
      current.push({ id: `f_${Date.now()}`, uuid, user_message, bot_response, rule_id: rule_id || null, created_at: new Date().toISOString() });
      fs.writeFileSync(CHAT_FILE, JSON.stringify(current, null, 2), 'utf8');
      logger.warn('[ChatStore] DB unavailable, saved chat to file');
      return { savedTo: 'file' };
    } catch (fileErr) {
      logger.error('[ChatStore] Failed to persist chat to file:', fileErr.message);
      throw fileErr;
    }
  }
}

async function getHistory({ uuid, limit = 50 } = {}) {
  // Try DB first
  try {
    const where = uuid ? 'WHERE uuid = ?' : '';
    const params = uuid ? [uuid] : [];
    const [rows] = await pool.query(
      `SELECT id, uuid, user_message, bot_response, rule_id, created_at
       FROM sarga_website_chat_messages
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    return rows.map(r => ({ id: r.id, uuid: r.uuid, user_message: r.user_message, bot_response: r.bot_response, rule_id: r.rule_id, created_at: r.created_at }));
  } catch (err) {
    // Read from file
    try {
      ensureDataDir();
      const current = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8') || '[]');
      const filtered = uuid ? current.filter(c => c.uuid === uuid) : current;
      const sorted = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return sorted.slice(0, limit);
    } catch (fileErr) {
      logger.error('[ChatStore] Failed to read chat history from file:', fileErr.message);
      throw fileErr;
    }
  }
}

module.exports = { saveChat, getHistory };
