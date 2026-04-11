const { pool } = require('../database');

function parseArgs(argv) {
    const args = {
        apply: false,
        confirm: '',
        from: null,
        to: null,
        branchId: null,
        limit: 500,
    };

    for (const raw of argv) {
        const part = String(raw || '').trim();
        if (!part) continue;

        if (part === '--apply') {
            args.apply = true;
            continue;
        }

        if (part.startsWith('--confirm=')) {
            args.confirm = part.split('=')[1] || '';
            continue;
        }

        if (part.startsWith('--from=')) {
            args.from = part.split('=')[1] || null;
            continue;
        }

        if (part.startsWith('--to=')) {
            args.to = part.split('=')[1] || null;
            continue;
        }

        if (part.startsWith('--branch=')) {
            const value = Number(part.split('=')[1]);
            args.branchId = Number.isFinite(value) ? value : null;
            continue;
        }

        if (part.startsWith('--limit=')) {
            const value = Number(part.split('=')[1]);
            if (Number.isFinite(value) && value > 0) args.limit = Math.floor(value);
            continue;
        }
    }

    return args;
}

function containsLaserLikeText(value) {
    const text = String(value || '').toLowerCase();
    return text.includes('laser') || text.includes('xerox') || text.includes('photocopy');
}

function detectLaserReasons(row, laserJobIds = new Set()) {
    const reasons = [];
    const rawBookType = String(row.book_type || '').trim();
    const normalizedBookType = rawBookType.toLowerCase();

    if (normalizedBookType === 'laser' && rawBookType !== 'Laser') {
        reasons.push('book_type_case_variant_laser');
    }

    if (containsLaserLikeText(row.description)) {
        reasons.push('description_has_laser_keyword');
    }

    let lines = [];
    try {
        lines = JSON.parse(row.order_lines || '[]');
        if (!Array.isArray(lines)) lines = [];
    } catch {
        lines = [];
    }

    for (const line of lines) {
        const lineBookType = String(line?.book_type || '').toLowerCase();
        const lineCategory = String(line?.category || '').toLowerCase();
        const lineName = `${line?.product_name || ''} ${line?.job_name || ''}`;
        const lineJobId = Number(line?.job_id);

        if (lineBookType === 'laser') reasons.push('order_line_book_type_laser');
        if (lineCategory === 'laser') reasons.push('order_line_category_laser');
        if (containsLaserLikeText(lineName)) reasons.push('order_line_name_has_laser_keyword');
        if (Number.isFinite(lineJobId) && laserJobIds.has(lineJobId)) {
            reasons.push('linked_job_category_laser');
        }
    }

    return Array.from(new Set(reasons));
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const where = ["(book_type IS NULL OR TRIM(book_type) = '' OR LOWER(book_type) <> 'laser')"];
    const params = [];

    if (args.from) {
        where.push('DATE(payment_date) >= ?');
        params.push(args.from);
    }
    if (args.to) {
        where.push('DATE(payment_date) <= ?');
        params.push(args.to);
    }
    if (args.branchId) {
        where.push('branch_id = ?');
        params.push(args.branchId);
    }

    const sql = `
        SELECT id, branch_id, customer_name, payment_date, advance_paid, description, order_lines, book_type
        FROM sarga_customer_payments
        WHERE ${where.join(' AND ')}
        ORDER BY id DESC
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [...params, args.limit]);

    const allJobIds = [];
    for (const row of rows) {
        try {
            const lines = JSON.parse(row.order_lines || '[]');
            if (!Array.isArray(lines)) continue;
            for (const line of lines) {
                const jobId = Number(line?.job_id);
                if (Number.isFinite(jobId)) allJobIds.push(jobId);
            }
        } catch {
            // Ignore malformed JSON and continue with text-based detection
        }
    }

    const uniqueJobIds = Array.from(new Set(allJobIds));
    const laserJobIds = new Set();
    if (uniqueJobIds.length > 0) {
        const placeholders = uniqueJobIds.map(() => '?').join(',');
        const [jobRows] = await pool.query(
            `SELECT id, category FROM sarga_jobs WHERE id IN (${placeholders})`,
            uniqueJobIds
        );
        for (const job of jobRows) {
            if (String(job.category || '').trim().toLowerCase() === 'laser') {
                laserJobIds.add(Number(job.id));
            }
        }
    }

    const rowIds = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
    const laserPaymentIds = new Set();
    if (rowIds.length > 0) {
        const placeholders = rowIds.map(() => '?').join(',');
        const [linkedRows] = await pool.query(
            `SELECT DISTINCT payment_id FROM sarga_jobs WHERE payment_id IN (${placeholders}) AND LOWER(COALESCE(category, '')) = 'laser'`,
            rowIds
        );
        for (const item of linkedRows) {
            const id = Number(item.payment_id);
            if (Number.isFinite(id)) laserPaymentIds.add(id);
        }
    }

    const candidates = rows
        .map((row) => {
            const reasons = detectLaserReasons(row, laserJobIds);
            if (laserPaymentIds.has(Number(row.id))) reasons.push('linked_payment_job_category_laser');
            return { row, reasons: Array.from(new Set(reasons)) };
        })
        .filter((item) => item.reasons.length > 0);

    console.log('--- Laser Book Type Repair ---');
    console.log(`Scanned Offset rows: ${rows.length}`);
    console.log(`Likely Laser rows: ${candidates.length}`);

    if (candidates.length === 0) {
        console.log('No likely mis-tagged Laser rows found with current filters.');
        return;
    }

    console.log('\nPreview (first 20):');
    for (const item of candidates.slice(0, 20)) {
        const r = item.row;
        console.log(
            `#${r.id} | ${r.payment_date} | branch ${r.branch_id} | ${r.customer_name} | advance ${r.advance_paid} | reasons: ${item.reasons.join(',')}`
        );
    }

    if (!args.apply) {
        console.log('\nDry run only. No database changes made.');
        console.log('To apply: node scripts/fix-laser-book-type.js --apply --confirm=LASER [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--branch=ID]');
        return;
    }

    if (args.confirm !== 'LASER') {
        throw new Error('Missing safety confirm. Re-run with --confirm=LASER');
    }

    const ids = candidates.map((item) => item.row.id);
    const placeholders = ids.map(() => '?').join(',');

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            `UPDATE sarga_customer_payments SET book_type = 'Laser' WHERE id IN (${placeholders}) AND book_type = 'Offset'`,
            ids
        );

        await conn.commit();
        console.log(`\nUpdated rows: ${result.affectedRows}`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

main()
    .catch((err) => {
        console.error('Repair failed:', err.message || err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
