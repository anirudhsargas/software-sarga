const { pool } = require('../database');

(async () => {
  try {
    const [machines] = await pool.query(
      `SELECT m.id, m.machine_name, b.name as branch_name,
        (SELECT GROUP_CONCAT(msa.staff_id) FROM sarga_machine_staff_assignments msa WHERE msa.machine_id = m.id) as assigned_staff_ids
       FROM sarga_machines m
       LEFT JOIN sarga_branches b ON m.branch_id = b.id
       ORDER BY m.machine_name ASC`
    );

    console.log('machines:');
    machines.forEach(m => {
      console.log(`- id=${m.id} name=${m.machine_name} branch=${m.branch_name} assigned=[${m.assigned_staff_ids || ''}]`);
    });

    const [assignments] = await pool.query(
      `SELECT msa.id, msa.machine_id, msa.staff_id, s.name as staff_name, m.machine_name
       FROM sarga_machine_staff_assignments msa
       JOIN sarga_staff s ON msa.staff_id = s.id
       JOIN sarga_machines m ON msa.machine_id = m.id
       ORDER BY msa.assigned_at DESC`
    );

    console.log('\nassignments:');
    assignments.forEach(a => {
      console.log(`- assign_id=${a.id} machine=${a.machine_name} machine_id=${a.machine_id} staff=${a.staff_name} staff_id=${a.staff_id}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
