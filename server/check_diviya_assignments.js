const { pool } = require('./database');

async function check() {
    try {
        const [diviya] = await pool.query("SELECT id, name, role, branch_id FROM sarga_staff WHERE name LIKE '%Diviya%'");
        console.log('--- Diviya Info ---');
        console.log(JSON.stringify(diviya, null, 2));

        if (diviya.length > 0) {
            const staffId = diviya[0].id;
            const [assignments] = await pool.query('SELECT * FROM sarga_machine_staff_assignments WHERE staff_id = ?', [staffId]);
            console.log('--- Assignments for Diviya ---');
            console.log(JSON.stringify(assignments, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
