const { pool } = require('./database');
async function run() {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log(`--- DATE: ${today} ---`);

        const [jobs] = await pool.query('SELECT id, job_number, job_name, category, machine_id, total_amount, advance_paid FROM sarga_jobs WHERE DATE(created_at) = ?', [today]);
        console.log('--- TODAY JOBS ---');
        jobs.forEach(j => console.log(`Job ${j.id}: ${j.job_number} | ${j.job_name} | Cat: ${j.category} | Mach: ${j.machine_id} | Total: ${j.total_amount}`));

        const [reports] = await pool.query('SELECT * FROM sarga_daily_report_machine WHERE report_date = ?', [today]);
        console.log('--- TODAY MACHINE REPORTS ---');
        reports.forEach(r => console.log(`Report ${r.id}: Machine ${r.machine_id} | Branch ${r.branch_id}`));

        const [entries] = await pool.query('SELECT e.*, r.machine_id FROM sarga_machine_work_entries e JOIN sarga_daily_report_machine r ON e.report_id = r.id WHERE r.report_date = ?', [today]);
        console.log('--- TODAY MACHINE WORK ENTRIES ---');
        entries.forEach(e => console.log(`Entry ${e.id}: Mach ${e.machine_id} | Cust: ${e.customer_name} | Details: ${e.work_details} | Amount: ${e.total_amount}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
