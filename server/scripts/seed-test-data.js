require('dotenv').config();
const mysql = require('mysql2/promise');

const MOBILE = '9999999999';
const CUSTOMER_NAME = 'Test Customer';

const run = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [branches] = await conn.execute('SELECT id FROM sarga_branches ORDER BY id LIMIT 1');
  let branchId = branches[0]?.id || null;
  if (!branchId) {
    const [res] = await conn.execute(
      'INSERT INTO sarga_branches (name, address) VALUES (?, ?)',
      ['Main Branch', 'Default Address']
    );
    branchId = res.insertId;
  }

  const [existing] = await conn.execute('SELECT id FROM sarga_customers WHERE mobile = ?', [MOBILE]);
  let customerId = existing[0]?.id || null;
  if (!customerId) {
    const [res] = await conn.execute(
      'INSERT INTO sarga_customers (mobile, name, type, email, gst, address, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [MOBILE, CUSTOMER_NAME, 'Retail', 'test@example.com', 'GSTTEST1234', 'Test Address', branchId]
    );
    customerId = res.insertId;
  }

  const [cols] = await conn.execute('SHOW COLUMNS FROM sarga_jobs');
  const colNames = cols.map((c) => c.Field);
  const hasProduct = colNames.includes('product_id');
  const hasBranch = colNames.includes('branch_id');
  const hasApplied = colNames.includes('applied_extras');

  const now = Date.now().toString().slice(-8);
  const job1 = `J-${now}-1`;
  const job2 = `J-${now}-2`;

  const columns = ['customer_id'];
  const valuesBase = [customerId];

  if (hasProduct) {
    columns.push('product_id');
    valuesBase.push(null);
  }

  if (hasBranch) {
    columns.push('branch_id');
    valuesBase.push(branchId);
  }

  columns.push(
    'job_number',
    'job_name',
    'description',
    'quantity',
    'unit_price',
    'total_amount',
    'advance_paid',
    'balance_amount',
    'payment_status',
    'delivery_date'
  );
  valuesBase.push(null);

  const sqlCols = columns.join(',');
  const placeholders = columns.map(() => '?').join(',');
  const sql = `INSERT INTO sarga_jobs (${sqlCols}) VALUES (${placeholders})`;

  const buildValues = (jobNumber, name, desc, qty, unit, total, adv, balance, status) => {
    const vals = [...valuesBase];
    vals[columns.indexOf('job_number')] = jobNumber;
    vals[columns.indexOf('job_name')] = name;
    vals[columns.indexOf('description')] = desc;
    vals[columns.indexOf('quantity')] = qty;
    vals[columns.indexOf('unit_price')] = unit;
    vals[columns.indexOf('total_amount')] = total;
    vals[columns.indexOf('advance_paid')] = adv;
    vals[columns.indexOf('balance_amount')] = balance;
    vals[columns.indexOf('payment_status')] = status;
    vals[columns.indexOf('delivery_date')] = null;
    return vals;
  };

  await conn.execute(sql, buildValues(job1, 'Test Job A', 'Test job line A', 2, 150, 300, 100, 200, 'Partial'));
  await conn.execute(sql, buildValues(job2, 'Test Job B', 'Test job line B', 1, 200, 200, 0, 200, 'Unpaid'));

  if (hasApplied) {
    await conn.execute(
      'UPDATE sarga_jobs SET applied_extras = ? WHERE job_number IN (?, ?)',
      [JSON.stringify([]), job1, job2]
    );
  }

  await conn.execute(
    'INSERT INTO sarga_customer_payments (customer_id, customer_name, customer_mobile, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date, order_lines, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      customerId,
      CUSTOMER_NAME,
      MOBILE,
      500,
      423.73,
      38.14,
      38.14,
      100,
      400,
      'Cash',
      100,
      0,
      'TESTREF',
      'Test payment entry',
      new Date().toISOString().slice(0, 10),
      JSON.stringify([]),
      branchId
    ]
  );

  await conn.end();
  console.log('Test data inserted for customer mobile 9999999999');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
