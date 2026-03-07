const { pool } = require('./database');
async function run() {
    try {
        const [columns] = await pool.query('DESCRIBE sarga_machine_work_entries');
        console.log('--- sarga_machine_work_entries ---');
        for (const col of columns) {
            console.log(`Column: ${col.Field}`);
        }

        const [jobsCols] = await pool.query('DESCRIBE sarga_jobs');
        console.log('--- sarga_jobs ---');
        for (const col of jobsCols) {
            console.log(`Column: ${col.Field}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
