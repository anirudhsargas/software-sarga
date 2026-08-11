// Migration 041: Add total_copies column to sarga_machine_readings if missing
module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'sarga_db';
  console.log('[Migration 041] Ensuring total_copies column exists in sarga_machine_readings...');

  const [cols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_machine_readings' AND COLUMN_NAME = 'total_copies'`,
    [dbName]
  );
  if (cols.length === 0) {
    await connection.query(`ALTER TABLE sarga_machine_readings ADD COLUMN total_copies INT DEFAULT 0 AFTER closing_count`);
    console.log('[Migration 041] Added total_copies column to sarga_machine_readings');
  } else {
    console.log('[Migration 041] total_copies column already exists in sarga_machine_readings');
  }
};
