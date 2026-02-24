/**
 * Seed test data for the Expense Manager module
 * Run: node scripts/seed-expense-data.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('Starting expense test data seeding...\n');

    // ── 1. Check branches exist
    const [branches] = await conn.query('SELECT id, name FROM sarga_branches LIMIT 5');
    if (!branches.length) { console.log('No branches found. Create branches first.'); return; }
    const b1 = branches[0].id;
    const b2 = branches.length > 1 ? branches[1].id : b1;
    console.log(`Using branches: ${branches.map(b => `${b.id}:${b.name}`).join(', ')}`);

    // ── 2. Check/Create vendors
    const [existingVendors] = await conn.query('SELECT id, name FROM sarga_vendors LIMIT 20');
    let vendorIds = existingVendors.map(v => v.id);
    if (vendorIds.length < 3) {
      console.log('Creating test vendors...');
      const testVendors = [
        ['Arrow Digital', 'Vendor', 'Rajesh Kumar', '9876543210', 'Kozhikode', b1, null, null],
        ['Konica Minolta Service', 'Vendor', 'Suresh', '9876543211', 'Calicut', b1, null, null],
        ['Paper House Supplies', 'Vendor', 'Anwar', '9876543212', 'Perambra', b2, null, null],
        ['Printo Ink Solutions', 'Vendor', 'Manoj', '9876543213', 'Meppayur', b1, null, null],
        ['KSEB Electricity', 'Utility', null, null, null, b1, null, null],
        ['Asianet Broadband', 'Utility', null, null, null, b1, null, null],
      ];
      for (const v of testVendors) {
        try {
          const [r] = await conn.query('INSERT INTO sarga_vendors (name, type, contact_person, phone, address, branch_id, order_link, gstin) VALUES (?,?,?,?,?,?,?,?)', v);
          vendorIds.push(r.insertId);
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY') {
            const [existing] = await conn.query('SELECT id FROM sarga_vendors WHERE name = ?', [v[0]]);
            if (existing.length) vendorIds.push(existing[0].id);
          }
        }
      }
      console.log(`  Vendors ready: ${vendorIds.length}`);
    } else {
      console.log(`Using existing ${vendorIds.length} vendors`);
    }

    // ── 3. Vendor Bills
    console.log('Seeding vendor bills...');
    const today = new Date();
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    // Correct last-day-of-month calculation
    const thisMonthLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const lastMonthLastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
    const thisMonthEnd = `${thisMonth}-${String(thisMonthLastDay).padStart(2, '0')}`;
    const lastMonthEnd = `${lastMonthStr}-${String(lastMonthLastDay).padStart(2, '0')}`;

    const vendorBills = [
      [vendorIds[0] || 1, b1, `INV-${thisMonth}-001`, `${thisMonth}-05`, 15000, 'Purchased vinyl rolls'],
      [vendorIds[0] || 1, b1, `INV-${thisMonth}-002`, `${thisMonth}-12`, 8500, 'Flex banners order'],
      [vendorIds[1] || 1, b1, `INV-${thisMonth}-003`, `${thisMonth}-08`, 12000, 'Toner cartridge set'],
      [vendorIds[2] || 1, b2, `INV-${thisMonth}-004`, `${thisMonth}-03`, 5500, 'A4 paper bulk'],
      [vendorIds[3] || 1, b1, `INV-${lastMonthStr}-010`, `${lastMonthStr}-20`, 22000, 'Printer ink supply'],
      [vendorIds[0] || 1, b1, `INV-${lastMonthStr}-011`, `${lastMonthStr}-14`, 9000, 'Lamination sheets'],
    ];
    for (const bill of vendorBills) {
      try {
        await conn.query(
          'INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount, description) VALUES (?,?,?,?,?,?)',
          bill
        );
      } catch (e) { if (e.code !== 'ER_DUP_ENTRY') console.log('  Bill skip:', e.message.slice(0, 60)); }
    }
    console.log('  Vendor bills seeded.');

    // ── 4. Utility Bills
    console.log('Seeding utility bills...');
    const utilityBills = [
      [b1, 'Electricity', `${thisMonth}-10`, 4200, `KSEB-${thisMonth}`, `Electricity bill for ${thisMonth}`],
      [b1, 'Internet / Broadband', `${thisMonth}-05`, 1500, `NET-${thisMonth}`, 'Monthly internet'],
      [b2, 'Electricity', `${thisMonth}-10`, 3100, `KSEB-B2-${thisMonth}`, `Electricity Perambra`],
      [b1, 'Phone', `${thisMonth}-07`, 800, `PHN-${thisMonth}`, 'Office phone bill'],
      [b1, 'Electricity', `${lastMonthStr}-10`, 3800, `KSEB-${lastMonthStr}`, `Last month electricity`],
      [b2, 'Internet / Broadband', `${lastMonthStr}-05`, 1500, `NET-B2-${lastMonthStr}`, 'Last month internet'],
    ];
    for (const bill of utilityBills) {
      try {
        await conn.query(
          'INSERT INTO sarga_utility_bills (branch_id, utility_type, bill_date, amount, bill_number, description) VALUES (?,?,?,?,?,?)',
          bill
        );
      } catch (e) { if (e.code !== 'ER_DUP_ENTRY') console.log('  Utility skip:', e.message.slice(0, 60)); }
    }
    console.log('  Utility bills seeded.');

    // ── 5. Payments (across all types)
    console.log('Seeding payments...');
    const payments = [
      // Vendor payments
      [b1, 'Vendor', 'Arrow Digital', 10000, 'UPI', 0, 0, 'UPI-VND-001', 'Partial payment for vinyl', `${thisMonth}-06`, vendorIds[0] || null, null, null, null, 15000, 1, 'Partially Paid'],
      [b2, 'Vendor', 'Paper House Supplies', 5500, 'Cash', 5500, 0, 'CASH-VND-001', 'Full payment for paper', `${thisMonth}-04`, vendorIds[2] || null, null, null, null, 5500, 0, 'Fully Paid'],
      [b1, 'Vendor', 'Printo Ink Solutions', 15000, 'Both', 8000, 7000, 'BOTH-VND-001', 'Partial ink payment', `${lastMonthStr}-22`, vendorIds[3] || null, null, null, null, 22000, 1, 'Partially Paid'],
      [b1, 'Vendor', 'Konica Minolta Service', 12000, 'Bank Transfer', 0, 0, 'BT-VND-001', 'Toner full pay', `${thisMonth}-09`, vendorIds[1] || null, null, null, null, 12000, 0, 'Fully Paid'],

      // Utility payments
      [b1, 'Utility', 'Asianet Broadband', 1500, 'UPI', 0, 0, 'UPI-UTL-001', 'Internet bill', `${thisMonth}-06`, null, null, null, null, 1500, 0, 'Fully Paid'],
      [b1, 'Utility', 'KSEB', 3800, 'Cash', 3800, 0, null, 'Last month electricity', `${lastMonthStr}-15`, null, null, null, null, 3800, 0, 'Fully Paid'],
      [b2, 'Utility', 'Asianet Broadband', 1500, 'UPI', 0, 0, 'UPI-UTL-002', 'Last month internet Perambra', `${lastMonthStr}-06`, null, null, null, null, 1500, 0, 'Fully Paid'],

      // Rent payments
      [b1, 'Rent', 'Building Owner - Meppayur', 15000, 'Bank Transfer', 0, 0, 'BT-RENT-001', 'Monthly rent', `${thisMonth}-01`, null, null, `${thisMonth}-01`, thisMonthEnd, null, 0, 'Fully Paid'],
      [b2, 'Rent', 'Building Owner - Perambra', 12000, 'Bank Transfer', 0, 0, 'BT-RENT-002', 'Monthly rent', `${thisMonth}-01`, null, null, `${thisMonth}-01`, thisMonthEnd, null, 0, 'Fully Paid'],
      [b1, 'Rent', 'Building Owner - Meppayur', 15000, 'Bank Transfer', 0, 0, 'BT-RENT-003', 'Last month rent', `${lastMonthStr}-01`, null, null, `${lastMonthStr}-01`, lastMonthEnd, null, 0, 'Fully Paid'],

      // Salary payments
      [b1, 'Salary', 'Rahul - Designer', 18000, 'Bank Transfer', 0, 0, 'BT-SAL-001', 'Monthly salary', `${thisMonth}-05`, null, null, `${thisMonth}-01`, thisMonthEnd, null, 0, 'Fully Paid'],
      [b1, 'Salary', 'Suresh - Printer', 15000, 'Cash', 15000, 0, null, 'Monthly salary', `${thisMonth}-05`, null, null, `${thisMonth}-01`, thisMonthEnd, null, 0, 'Fully Paid'],
      [b2, 'Salary', 'Arun - Front Office', 14000, 'Bank Transfer', 0, 0, 'BT-SAL-002', 'Monthly salary', `${thisMonth}-05`, null, null, `${thisMonth}-01`, thisMonthEnd, null, 0, 'Fully Paid'],

      // Other payments
      [b1, 'Other', 'Courier Service', 350, 'Cash', 350, 0, null, 'Customer delivery', `${thisMonth}-08`, null, null, null, null, null, 0, 'Fully Paid'],
      [b1, 'Other', 'Tea Shop - Monthly', 2000, 'Cash', 2000, 0, null, 'Monthly tea bill', `${thisMonth}-10`, null, null, null, null, null, 0, 'Fully Paid'],
      [b2, 'Other', 'Auto fare', 200, 'Cash', 200, 0, null, 'Customer delivery run', `${thisMonth}-12`, null, null, null, null, null, 0, 'Fully Paid'],
    ];

    for (const p of payments) {
      try {
        await conn.query(
          `INSERT INTO sarga_payments 
          (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, vendor_id, staff_id, period_start, period_end, bill_total_amount, is_partial_payment, payment_status) 
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          p
        );
      } catch (e) { console.log('  Payment skip:', e.message.slice(0, 80)); }
    }
    console.log('  Payments seeded.');

    // ── 6. Rent Locations
    console.log('Seeding rent locations...');
    const rentLocations = [
      [b1, 'Main Shop - Meppayur', 'Near Bus Stand, Meppayur', 'Muhammed', '9876541111', 15000, 1, 1],
      [b2, 'Branch Shop - Perambra', 'Market Road, Perambra', 'Rajan', '9876542222', 12000, 1, 1],
    ];
    for (const r of rentLocations) {
      try {
        await conn.query(
          'INSERT INTO sarga_rent_locations (branch_id, property_name, location, owner_name, owner_mobile, monthly_rent, due_day, is_active) VALUES (?,?,?,?,?,?,?,?)',
          r
        );
      } catch (e) { if (e.code !== 'ER_DUP_ENTRY') console.log('  Rent loc skip:', e.message.slice(0, 60)); }
    }
    console.log('  Rent locations seeded.');

    // ── 7. Transport Expenses
    console.log('Seeding transport expenses...');
    const transportExpenses = [
      [b1, 'Delivery', null, 'Driver Ali', 450, 'Cash', null, 'Customer order delivery to Kozhikode', `${thisMonth}-07`, null, 'Meppayur', 'Kozhikode', 45],
      [b1, 'Delivery', null, 'Auto fare', 150, 'Cash', null, 'Delivery to Nadapuram', `${thisMonth}-09`, null, 'Meppayur', 'Nadapuram', 20],
      [b2, 'Fuel', 'KL-11-1234', null, 500, 'Cash', null, 'Delivery bike fuel', `${thisMonth}-11`, null, null, null, null],
      [b1, 'Delivery', null, 'Lorry Transport', 2500, 'UPI', 'UPI-TRN-001', 'Paper roll transport from Calicut', `${thisMonth}-14`, null, 'Calicut', 'Meppayur', 55],
      [b1, 'Delivery', null, 'DTDC Courier', 350, 'Cash', null, 'Visiting cards delivery', `${lastMonthStr}-18`, null, null, null, null],
    ];
    for (const t of transportExpenses) {
      try {
        await conn.query(
          'INSERT INTO sarga_transport_expenses (branch_id, transport_type, vehicle_number, driver_name, amount, payment_method, reference_number, description, expense_date, bill_number, from_location, to_location, distance_km) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          t
        );
      } catch (e) { console.log('  Transport skip:', e.message.slice(0, 60)); }
    }
    console.log('  Transport expenses seeded.');

    // ── 8. Misc Expenses
    console.log('Seeding misc expenses...');
    const miscExpenses = [
      [b1, 'Petty Cash', null, 500, 'Cash', null, `${thisMonth}-03`, 'Small purchases', null],
      [b1, 'Tips', null, 200, 'Cash', null, `${thisMonth}-06`, 'Delivery boys tips', null],
      [b2, 'Small Tools', null, 800, 'Cash', null, `${thisMonth}-10`, 'Scissors and cutters', null],
      [b1, 'Emergency Purchases', null, 1200, 'UPI', 'UPI-MSC-001', `${thisMonth}-13`, 'Emergency paper', null],
      [b1, 'Donations', null, 500, 'Cash', null, `${lastMonthStr}-15`, 'Temple festival donation', null],
    ];
    for (const m of miscExpenses) {
      try {
        await conn.query(
          'INSERT INTO sarga_misc_expenses (branch_id, expense_category, vendor_name, amount, payment_method, reference_number, expense_date, description, bill_number) VALUES (?,?,?,?,?,?,?,?,?)',
          m
        );
      } catch (e) { console.log('  Misc skip:', e.message.slice(0, 60)); }
    }
    console.log('  Misc expenses seeded.');

    // ── 9. Office Expenses
    console.log('Seeding office expenses...');
    const officeExpenses = [
      [b1, 'Stationery', 'Local Stationery Shop', 650, 'Cash', null, `${thisMonth}-04`, 'Pens, stapler, files', null],
      [b1, 'Maintenance', 'Konica Service', 3500, 'UPI', 'UPI-OFC-001', `${thisMonth}-08`, 'Toner refill', 'BL-TNR-001'],
      [b2, 'Office Supplies', 'Paper House', 2200, 'Cash', null, `${thisMonth}-06`, 'A4 paper ream', null],
      [b1, 'Maintenance', 'Cleaning Staff', 1500, 'Cash', null, `${thisMonth}-01`, 'Monthly cleaning', null],
      [b1, 'Other', 'Tea Shop', 2000, 'Cash', null, `${thisMonth}-10`, 'Monthly tea & snacks', null],
      [b1, 'Equipment', 'Tech Support', 1500, 'UPI', 'UPI-OFC-002', `${lastMonthStr}-20`, 'PC repair service', 'SRV-001'],
    ];
    for (const o of officeExpenses) {
      try {
        await conn.query(
          'INSERT INTO sarga_office_expenses (branch_id, expense_type, vendor_name, amount, payment_method, reference_number, expense_date, description, bill_number) VALUES (?,?,?,?,?,?,?,?,?)',
          o
        );
      } catch (e) { console.log('  Office skip:', e.message.slice(0, 60)); }
    }
    console.log('  Office expenses seeded.');

    // ── 10. Petty Cash
    console.log('Seeding petty cash entries...');
    const pettyCash = [
      [b1, `${thisMonth}-01`, 'Opening', 5000, 'Initial petty cash fund', null, 5000, null, null, 'Opening Balance'],
      [b1, `${thisMonth}-03`, 'Cash Out', 350, 'Auto fare for delivery', null, 4650, null, 'Courier', 'Travel'],
      [b1, `${thisMonth}-05`, 'Cash Out', 200, 'Tea and snacks', null, 4450, null, null, 'Tea / Snacks'],
      [b1, `${thisMonth}-08`, 'Cash Out', 500, 'Stationery items', null, 3950, null, null, 'Stationery'],
      [b1, `${thisMonth}-10`, 'Cash In', 2000, 'Cash refill from main', null, 5950, 'Main Counter', null, 'Refill'],
      [b1, `${thisMonth}-12`, 'Cash Out', 150, 'Parking charges', null, 5800, null, null, 'Parking'],
      [b2, `${thisMonth}-01`, 'Opening', 3000, 'Initial petty cash', null, 3000, null, null, 'Opening Balance'],
      [b2, `${thisMonth}-06`, 'Cash Out', 400, 'Cleaning supplies', null, 2600, null, null, 'Cleaning'],
    ];
    for (const pc of pettyCash) {
      try {
        await conn.query(
          'INSERT INTO sarga_petty_cash (branch_id, transaction_date, transaction_type, amount, description, reference_number, balance_after, received_from, paid_to, category) VALUES (?,?,?,?,?,?,?,?,?,?)',
          pc
        );
      } catch (e) { console.log('  Petty cash skip:', e.message.slice(0, 60)); }
    }
    console.log('  Petty cash seeded.');

    // ── 11. Seed some customer billing data for revenue on dashboard
    console.log('Checking for billing/revenue data...');
    const [[{ jobCount }]] = await conn.query(`SELECT COUNT(*) as jobCount FROM sarga_jobs WHERE created_at >= '${thisMonth}-01'`);
    if (Number(jobCount) === 0) {
      console.log('  Seeding a few jobs for revenue display...');
      // Check if we have a customer
      const [customers] = await conn.query('SELECT id FROM sarga_customers LIMIT 1');
      let custId = customers.length ? customers[0].id : null;
      if (!custId) {
        const [cr] = await conn.query("INSERT INTO sarga_customers (mobile, name, type) VALUES ('9999999999', 'Walk-in Customer', 'Walk-in')");
        custId = cr.insertId;
      }
      const jobs = [
        [custId, null, b1, 'Visiting Cards 500pcs', '', 500, 3, 1500, 0, `${thisMonth}-02`, 'Completed'],
        [custId, null, b1, 'Flex Banner 8x4', '', 1, 2000, 2000, 500, `${thisMonth}-05`, 'Completed'],
        [custId, null, b2, 'Wedding Cards 200pcs', '', 200, 15, 3000, 1000, `${thisMonth}-07`, 'Completed'],
        [custId, null, b1, 'Brochure Design + Print', '', 100, 25, 2500, 0, `${thisMonth}-10`, 'In Progress'],
        [custId, null, b1, 'ID Cards 50pcs', '', 50, 40, 2000, 2000, `${thisMonth}-12`, 'Completed'],
      ];
      for (const j of jobs) {
        try {
          await conn.query(
            'INSERT INTO sarga_jobs (customer_id, product_id, branch_id, job_name, description, quantity, unit_price, total_amount, advance_paid, delivery_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            j
          );
        } catch (e) { console.log('  Job skip:', e.message.slice(0, 60)); }
      }
      console.log('  Jobs seeded for revenue.');
    }

    console.log('\n✅ Expense test data seeded successfully!');
    console.log(`\nSummary:`);
    const [[{ pc: pcCount }]] = await conn.query('SELECT COUNT(*) as pc FROM sarga_payments');
    const [[{ vc: vbCount }]] = await conn.query('SELECT COUNT(*) as vc FROM sarga_vendor_bills');
    const [[{ uc: ubCount }]] = await conn.query('SELECT COUNT(*) as uc FROM sarga_utility_bills');
    const [[{ tc: trCount }]] = await conn.query('SELECT COUNT(*) as tc FROM sarga_transport_expenses');
    const [[{ mc: msCount }]] = await conn.query('SELECT COUNT(*) as mc FROM sarga_misc_expenses');
    const [[{ oc: ofCount }]] = await conn.query('SELECT COUNT(*) as oc FROM sarga_office_expenses');
    const [[{ ptc: ptCount }]] = await conn.query('SELECT COUNT(*) as ptc FROM sarga_petty_cash');
    console.log(`  Payments: ${pcCount}`);
    console.log(`  Vendor Bills: ${vbCount}`);
    console.log(`  Utility Bills: ${ubCount}`);
    console.log(`  Transport Expenses: ${trCount}`);
    console.log(`  Misc Expenses: ${msCount}`);
    console.log(`  Office Expenses: ${ofCount}`);
    console.log(`  Petty Cash Entries: ${ptCount}`);

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
