const { pool } = require('./database');

async function check() {
    try {
        const [machines] = await pool.query("SELECT id, machine_name, machine_type FROM sarga_machines WHERE branch_id = 4");
        console.log('--- Branch 4 Machines ---');
        console.log(JSON.stringify(machines, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
