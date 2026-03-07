const { pool } = require('./database');
async function run() {
    try {
        const date = new Date().toISOString().split('T')[0];
        const branchId = 4; // MEPPAYUR
        console.log(`--- DATE: ${date} | Branch: ${branchId} ---`);

        // 1. Get active Digital machines for this branch.
        const [machines] = await pool.query(
            `SELECT m.id, m.machine_name, m.machine_type, m.counter_type, m.location
             FROM sarga_machines m
             WHERE m.branch_id = ? AND m.is_active = 1 AND m.machine_type = 'Digital'
             ORDER BY m.machine_name ASC`,
            [branchId]
        );
        console.log(`Found ${machines.length} Digital machines in Branch ${branchId}`);
        machines.forEach(m => console.log(`  - ${m.id}: ${m.machine_name}`));

        // 2. Get machine readings for today
        const machineIds = machines.map(m => m.id);
        let readings = [];
        if (machineIds.length > 0) {
            const [readingRows] = await pool.query(
                `SELECT mr.machine_id, mr.opening_count, mr.closing_count, mr.total_copies
                 FROM sarga_machine_readings mr
                 WHERE mr.reading_date = ? AND mr.machine_id IN (${machineIds.map(() => '?').join(',')})`,
                [date, ...machineIds]
            );
            readings = readingRows;
        }
        console.log(`Found ${readings.length} readings for today`);

        // 3. Get machine work entries for today
        let workEntries = [];
        if (machineIds.length > 0) {
            const [reports] = await pool.query(
                `SELECT drm.id as report_id, drm.machine_id
                 FROM sarga_daily_report_machine drm
                 WHERE drm.report_date = ? AND drm.machine_id IN (${machineIds.map(() => '?').join(',')})`,
                [date, ...machineIds]
            );
            const reportIds = reports.map(r => r.report_id);
            console.log(`Found ${reports.length} report headers for these machines`);

            if (reportIds.length > 0) {
                const [entries] = await pool.query(
                    `SELECT mwe.*, drm.machine_id, m.machine_name
                     FROM sarga_machine_work_entries mwe
                     JOIN sarga_daily_report_machine drm ON mwe.report_id = drm.id
                     JOIN sarga_machines m ON drm.machine_id = m.id
                     WHERE mwe.report_id IN (${reportIds.map(() => '?').join(',')})
                     ORDER BY mwe.entry_time ASC`,
                    [...reportIds]
                );
                workEntries = entries;
                console.log(`Found ${workEntries.length} work entries total`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
