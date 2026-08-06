// Migration 040: Add machine_category to sarga_machines
// When a machine's machine_type is 'Digital', operators choose a category:
// Laser / Photocopy / Colour Photocopy. Stored as a free VARCHAR so it is
// forward-compatible and does not collide with the existing book_type ENUM.
module.exports = async (connection) => {
  console.log('[Migration 040] Adding machine_category to sarga_machines...');

  await connection.query(
    `ALTER TABLE sarga_machines
     ADD COLUMN machine_category VARCHAR(30) DEFAULT NULL AFTER book_type`
  );

  console.log('[Migration 040] Added machine_category to sarga_machines');
};