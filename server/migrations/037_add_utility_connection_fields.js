module.exports = async (connection) => {
  // Add missing columns to sarga_utility_connections
  const addConnectionColumns = [
    `ALTER TABLE sarga_utility_connections
      ADD COLUMN provider VARCHAR(200) DEFAULT NULL AFTER utility_type`,
    `ALTER TABLE sarga_utility_connections
      ADD COLUMN billing_cycle VARCHAR(50) DEFAULT 'monthly' AFTER provider`,
  ];
  for (const stmt of addConnectionColumns) {
    try { await connection.query(stmt); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }

  // Add connection_record_id FK column to sarga_utility_bills
  try {
    await connection.query(
      `ALTER TABLE sarga_utility_bills
        ADD COLUMN connection_record_id INT DEFAULT NULL AFTER connection_id`
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e;
  }

  // Add FK constraint (ignore if already exists)
  try {
    await connection.query(
      `ALTER TABLE sarga_utility_bills
        ADD CONSTRAINT fk_utility_bill_connection
        FOREIGN KEY (connection_record_id) REFERENCES sarga_utility_connections(id)
        ON DELETE SET NULL`
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_CANT_CREATE_FOREIGN') throw e;
  }
};
