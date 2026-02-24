/**
 * Seed test data for Daily Report
 * - Creates opening balances for today (all 3 books)
 * - Creates customer payments (income entries)
 * - Creates expense payments
 * - Creates machine readings
 * 
 * Usage: cd server && node scripts/seed-daily-report-test.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const run = async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    const today = new Date().toISOString().split('T')[0];
    console.log(`\n=== Seeding Daily Report test data for ${today} ===\n`);

    // 1. Get branch
    const [branches] = await conn.execute('SELECT id, name FROM sarga_branches ORDER BY id LIMIT 1');
    if (branches.length === 0) {
        console.log('No branches found. Creating default branch...');
        await conn.execute('INSERT INTO sarga_branches (name, address) VALUES (?, ?)', ['Main Branch', 'Default Address']);
    }
    const [branchRows] = await conn.execute('SELECT id, name FROM sarga_branches ORDER BY id LIMIT 1');
    const branchId = branchRows[0].id;
    console.log(`Branch: ${branchRows[0].name} (ID: ${branchId})`);

    // 2. Get or create staff (Front Office)
    let [staff] = await conn.execute("SELECT id FROM sarga_staff WHERE role = 'Front Office' AND branch_id = ? LIMIT 1", [branchId]);
    let staffId;
    if (staff.length === 0) {
        [staff] = await conn.execute("SELECT id FROM sarga_staff WHERE branch_id = ? LIMIT 1", [branchId]);
    }
    staffId = staff.length > 0 ? staff[0].id : 1;
    console.log(`Staff ID: ${staffId}`);

    // 3. Seed opening balances
    console.log('\n--- Opening Balances ---');
    const balances = [
        { book: 'Offset', amount: 5000.00 },
        { book: 'Laser', amount: 3000.00 },
        { book: 'Other', amount: 1500.00 }
    ];

    for (const b of balances) {
        await conn.execute(
            `INSERT INTO sarga_daily_opening_balances (report_date, branch_id, book_type, cash_opening, entered_by, is_locked)
             VALUES (?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE cash_opening = VALUES(cash_opening), is_locked = 1`,
            [today, branchId, b.book, b.amount, staffId]
        );
        console.log(`  ${b.book}: ₹${b.amount} (locked)`);
    }

    // 4. Get or create test customers
    let [customers] = await conn.execute('SELECT id, name FROM sarga_customers WHERE branch_id = ? LIMIT 3', [branchId]);
    if (customers.length === 0) {
        await conn.execute(
            'INSERT INTO sarga_customers (mobile, name, type, branch_id) VALUES (?, ?, ?, ?)',
            ['9876543210', 'Test Customer A', 'Retail', branchId]
        );
        await conn.execute(
            'INSERT INTO sarga_customers (mobile, name, type, branch_id) VALUES (?, ?, ?, ?)',
            ['9876543211', 'Test Customer B', 'Wholesale', branchId]
        );
        [customers] = await conn.execute('SELECT id, name FROM sarga_customers WHERE branch_id = ? LIMIT 3', [branchId]);
    }

    // 5. Seed customer payments (income for Offset tab)
    console.log('\n--- Customer Payments (Offset Income) ---');
    const payments = [
        { customer: customers[0]?.name || 'Walk-in', amount: 2500, method: 'Cash', desc: 'Business Cards 500pcs' },
        { customer: customers[1]?.name || 'Walk-in', amount: 4000, method: 'Both', desc: 'Letterhead Offset Print', cash: 2000, upi: 2000 },
        { customer: customers[0]?.name || 'Walk-in', amount: 1500, method: 'UPI', desc: 'Pamphlets 1000pcs' },
    ];

    // Check if customer_payments table has columns
    const [cpCols] = await conn.execute('SHOW COLUMNS FROM sarga_customer_payments');
    const cpColNames = cpCols.map(c => c.Field);

    for (const p of payments) {
        const cashAmt = p.method === 'Cash' ? p.amount : (p.method === 'Both' ? (p.cash || 0) : 0);
        const upiAmt = p.method === 'UPI' ? p.amount : (p.method === 'Both' ? (p.upi || 0) : 0);

        const cols = ['customer_name', 'total_amount', 'advance_paid', 'payment_method', 'cash_amount', 'upi_amount', 'description', 'payment_date', 'branch_id'];
        const vals = [p.customer, p.amount, p.amount, p.method, cashAmt, upiAmt, p.desc, today, branchId];

        if (cpColNames.includes('customer_id') && customers[0]) {
            cols.push('customer_id');
            vals.push(customers[0].id);
        }

        await conn.execute(
            `INSERT INTO sarga_customer_payments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            vals
        );
        console.log(`  ${p.customer}: ₹${p.amount} (${p.method}) - ${p.desc}`);
    }

    // 6. Seed expense payments
    console.log('\n--- Expense Payments ---');
    const expenses = [
        { type: 'Vendor', payee: 'Paper Supplier', amount: 3000, method: 'Cash', desc: 'A4 Paper 10 reams' },
        { type: 'Other', payee: 'Ink Vendor', amount: 1500, method: 'UPI', desc: 'Black Ink Cartridge' },
    ];

    for (const e of expenses) {
        const cashAmt = e.method === 'Cash' ? e.amount : 0;
        const upiAmt = e.method === 'UPI' ? e.amount : 0;

        await conn.execute(
            `INSERT INTO sarga_payments (type, payee_name, amount, payment_method, cash_amount, upi_amount, description, payment_date, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.type, e.payee, e.amount, e.method, cashAmt, upiAmt, e.desc, today, branchId]
        );
        console.log(`  ${e.type} - ${e.payee}: ₹${e.amount} (${e.method})`);
    }

    // 7. Seed machines and readings (for Laser tab)
    console.log('\n--- Machines & Readings ---');
    let [machines] = await conn.execute(
        "SELECT id, machine_name FROM sarga_machines WHERE branch_id = ? AND machine_type = 'Digital' AND is_active = 1",
        [branchId]
    );

    if (machines.length === 0) {
        await conn.execute(
            `INSERT INTO sarga_machines (machine_name, machine_type, counter_type, branch_id, is_active, location)
             VALUES (?, 'Digital', 'Counter', ?, 1, 'Ground Floor')`,
            ['Konica Minolta C258', branchId]
        );
        await conn.execute(
            `INSERT INTO sarga_machines (machine_name, machine_type, counter_type, branch_id, is_active, location)
             VALUES (?, 'Digital', 'Counter', ?, 1, 'First Floor')`,
            ['Xerox WorkCentre 7855', branchId]
        );
        [machines] = await conn.execute(
            "SELECT id, machine_name FROM sarga_machines WHERE branch_id = ? AND machine_type = 'Digital' AND is_active = 1",
            [branchId]
        );
    }

    const machineReadings = [
        { opening: 125340, closing: 125890 },
        { opening: 89750, closing: 90120 }
    ];

    for (let i = 0; i < machines.length && i < machineReadings.length; i++) {
        const m = machines[i];
        const r = machineReadings[i];
        const totalCopies = r.closing - r.opening;

        await conn.execute(
            `INSERT INTO sarga_machine_readings (machine_id, reading_date, opening_count, closing_count, total_copies, created_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE opening_count = VALUES(opening_count), closing_count = VALUES(closing_count), total_copies = VALUES(total_copies)`,
            [m.id, today, r.opening, r.closing, totalCopies, staffId]
        );
        console.log(`  ${m.machine_name}: Opening=${r.opening}, Closing=${r.closing}, Copies=${totalCopies}`);
    }

    // 8. Summary verification
    console.log('\n=== VERIFICATION ===');

    // Offset summary
    const [[offsetIncome]] = await conn.execute(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(advance_paid),0) as total FROM sarga_customer_payments WHERE DATE(payment_date) = ? AND branch_id = ?`,
        [today, branchId]
    );
    const [[offsetExpense]] = await conn.execute(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM sarga_payments WHERE DATE(payment_date) = ? AND branch_id = ?`,
        [today, branchId]
    );
    console.log(`\nOffset Tab:`);
    console.log(`  Opening: ₹5000.00`);
    console.log(`  Income: ${offsetIncome.cnt} entries = ₹${offsetIncome.total}`);
    console.log(`  Expenses: ${offsetExpense.cnt} entries = ₹${offsetExpense.total}`);
    const offsetCashIn = 2500 + 2000; // Cash amounts from our payments
    const offsetCashOut = 3000; // Cash expense
    console.log(`  Expected Cash Closing: ₹${5000 + offsetCashIn - offsetCashOut} (Opening + Cash In - Cash Out)`);

    // Laser summary
    const [[machineStats]] = await conn.execute(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(mr.total_copies),0) as copies
         FROM sarga_machine_readings mr JOIN sarga_machines m ON mr.machine_id = m.id
         WHERE mr.reading_date = ? AND m.branch_id = ? AND m.machine_type = 'Digital'`,
        [today, branchId]
    );
    console.log(`\nLaser Tab:`);
    console.log(`  Opening: ₹3000.00`);
    console.log(`  Machines: ${machineStats.cnt}, Total Copies: ${machineStats.copies}`);

    console.log(`\nOther Tab:`);
    console.log(`  Opening: ₹1500.00`);

    // Check lock status
    const [locks] = await conn.execute(
        `SELECT book_type, cash_opening, is_locked FROM sarga_daily_opening_balances WHERE report_date = ? AND branch_id = ?`,
        [today, branchId]
    );
    console.log(`\nLock Status:`);
    locks.forEach(l => {
        console.log(`  ${l.book_type}: ₹${l.cash_opening} - ${l.is_locked ? '🔒 LOCKED' : '🔓 Unlocked'}`);
    });

    console.log('\n✅ Test data seeded successfully!\n');
    await conn.end();
};

run().catch(err => {
    console.error('Error seeding test data:', err);
    process.exit(1);
});
