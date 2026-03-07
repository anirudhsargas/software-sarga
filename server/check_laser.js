const { pool } = require('./database');
async function run() {
    try {
        const [branches] = await pool.query('SELECT id, name FROM sarga_branches');
        console.log('--- BRANCHES ---');
        branches.forEach(b => console.log(`${b.id}: ${b.name}`));

        const [staff] = await pool.query('SELECT id, name, branch_id, role FROM sarga_staff');
        console.log('--- STAFF ---');
        staff.forEach(s => console.log(`${s.id}: ${s.name} (Branch: ${s.branch_id}, Role: ${s.role})`));

        const today = new Date().toISOString().split('T')[0];
        const [reports] = await pool.query('SELECT * FROM sarga_daily_report_machine WHERE report_date = ?', [today]);
        console.log('--- TODAY REPORTS ---');
        reports.forEach(r => console.log(`Report ${r.id}: Machine ${r.machine_id}, Branch ${r.branch_id}`));

        if (reports.length > 0) {
            const reportIds = reports.map(r => r.id);
            const [entries] = await pool.query(`SELECT * FROM sarga_machine_work_entries WHERE report_id IN (${reportIds.map(() => '?').join(',')})`, reportIds);
            console.log('--- TODAY ENTRIES ---');
            entries.forEach(e => console.log(`Entry ${e.id}: Report ${e.report_id}, Customer ${e.customer_name}, Details ${e.work_details}, Amount ${e.total_amount}`));
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
