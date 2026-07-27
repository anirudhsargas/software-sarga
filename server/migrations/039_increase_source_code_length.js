module.exports = async (connection) => {
  await connection.query(
    `ALTER TABLE sarga_inventory MODIFY COLUMN source_code VARCHAR(10) DEFAULT NULL`
  );
  console.log('[Migration 039] Increased source_code column from VARCHAR(3) to VARCHAR(10)');
};