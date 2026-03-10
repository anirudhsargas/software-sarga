/**
 * Seed Script: 10,000 test customers + random jobs + payments across both branches
 * Run from repo root:  node server/scripts/seed-test-data.js
 *
 * Flags:
 *   --clear    Delete all previously-seeded rows first (mobiles starting "90000")
 *   --count N  Number of customers to seed (default 10000)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const BRANCH_IDS     = [4, 5];
const TOTAL_CUSTOMERS = parseInt((process.argv.find(a => /^\d+$/.test(a))) || '10000', 10);
const BATCH_SIZE      = 500;
const CLEAR_MODE      = process.argv.includes('--clear');

// ─── helpers ─────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = arr => arr[rand(0, arr.length - 1)];

const FIRST_NAMES = [
  'Ravi','Suresh','Priya','Anita','Ramesh','Lakshmi','Vijay','Kavitha','Arun','Deepa',
  'Sanjay','Meena','Kumar','Rekha','Ajith','Sindhu','Babu','Nisha','Vinod','Saritha',
  'Praveen','Bindu','Rajesh','Indira','Biju','Suma','Rajiv','Sheela','Manoj','Latha',
  'Krishnan','Geetha','Sajeev','Mini','Sunil','Asha','Dileep','Jaya','Anil','Shobha',
  'Harish','Parvathy','Shibu','Vimala','Sreenath','Thressia','Jose','Mariam','Joby','Beena',
  'Shaji','Leena','Santhosh','Lisamma','Thomas','Saramma','George','Mathew','Rajan','Omana',
  'Mohan','Narayanan','Gopalakrishnan','Kalyani','Sivadas','Ammini','Devadas','Radha',
  'Padmanabhan','Savitri','Harikrishnan','Chandrika','Unnikrishnan','Vasantha','Murali','Usha',
];
const LAST_NAMES = [
  'Nair','Pillai','Menon','Varma','Kumar','Thomas','George','Mathew','Jose','Joseph',
  'Xavier','Francis','Philip','Antony','Paul','Krishnan','Rajan','Mohan','Vijayan',
  'Govindan','Narayanan','P.V.','K.K.','M.K.','P.K.','A.R.','B.K.','C.P.','K.V.',
];
const CUSTOMER_TYPES = ['Walk-in', 'Retail', 'Association', 'Offset'];

const JOB_CATEGORIES = [
  { cat:'Offset',    sub:'Visiting Cards',   minQty:100,  maxQty:5000, minRate:2,   maxRate:8   },
  { cat:'Offset',    sub:'Brochures',        minQty:50,   maxQty:2000, minRate:5,   maxRate:20  },
  { cat:'Offset',    sub:'Letterheads',      minQty:100,  maxQty:1000, minRate:3,   maxRate:10  },
  { cat:'Offset',    sub:'Bill Books',       minQty:50,   maxQty:500,  minRate:15,  maxRate:40  },
  { cat:'Laser',     sub:'A4 Printout',      minQty:1,    maxQty:500,  minRate:3,   maxRate:5   },
  { cat:'Laser',     sub:'A3 Printout',      minQty:1,    maxQty:200,  minRate:5,   maxRate:10  },
  { cat:'Laser',     sub:'Color Printout',   minQty:1,    maxQty:200,  minRate:10,  maxRate:20  },
  { cat:'Laser',     sub:'Lamination',       minQty:1,    maxQty:100,  minRate:15,  maxRate:30  },
  { cat:'Photostat', sub:'B&W Copy',         minQty:1,    maxQty:1000, minRate:1,   maxRate:2   },
  { cat:'Photostat', sub:'Color Copy',       minQty:1,    maxQty:200,  minRate:5,   maxRate:10  },
  { cat:'Flex',      sub:'Vinyl Flex',       minQty:1,    maxQty:50,   minRate:80,  maxRate:200 },
  { cat:'Sticker',   sub:'Roll Sticker',     minQty:100,  maxQty:10000,minRate:0.5, maxRate:3   },
  { cat:'Sticker',   sub:'Cut Sticker',      minQty:1,    maxQty:500,  minRate:5,   maxRate:25  },
  { cat:'Design',    sub:'Logo Design',      minQty:1,    maxQty:1,    minRate:500, maxRate:2000},
  { cat:'Binding',   sub:'Spiral Binding',   minQty:1,    maxQty:50,   minRate:20,  maxRate:50  },
  { cat:'Scan',      sub:'Document Scan',    minQty:1,    maxQty:100,  minRate:5,   maxRate:10  },
];

const JOB_WORD = ['Wedding','Business','School','Office','Event','Festival','Annual','Urgent','Bulk'];
const PAY_METHODS = ['Cash','UPI','Both'];

function randomName()   { return `Test ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }
function randomMobile(n){ return String(9_000_000_000 + n); } // 10-digit mobile starting with 9
function randomDate(daysBack=730) {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, daysBack));
  return d.toISOString().slice(0,10);
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool({
    host    : process.env.DB_HOST || 'localhost',
    user    : process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  const conn = await pool.getConnection();
  try {
    // ── optional clear ──────────────────────────────────────────────────────
    if (CLEAR_MODE) {
      console.log('🗑  Clearing previously seeded test data…');
      const [delPay] = await conn.query(
        `DELETE FROM sarga_customer_payments WHERE customer_name LIKE 'Test %'`);
      const [delJob] = await conn.query(`
        DELETE j FROM sarga_jobs j
        INNER JOIN sarga_customers c ON j.customer_id = c.id
        WHERE c.name LIKE 'Test %'`);
      const [delCust] = await conn.query(
        `DELETE FROM sarga_customers WHERE name LIKE 'Test %'`);
      console.log(`  Deleted ${delPay.affectedRows} payments, ${delJob.affectedRows} jobs, ${delCust.affectedRows} customers\n`);
    }

    // ── starting counters ───────────────────────────────────────────────────
    const [[{ maxMob }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(mobile AS UNSIGNED)), 9000000000) AS maxMob
       FROM sarga_customers WHERE name LIKE 'Test %'`);
    let mobileCounter = Number(maxMob) - 9_000_000_000 + 1;

    const [[{ maxJob }]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(job_number,6) AS UNSIGNED)), 0) AS maxJob
       FROM sarga_jobs WHERE job_number LIKE 'SEED-%'`);
    let jobCounter = Number(maxJob) + 1;

    console.log(`🌱  Seeding ${TOTAL_CUSTOMERS.toLocaleString()} customers in batches of ${BATCH_SIZE}…`);
    console.log(`    Branches: ${BRANCH_IDS.join(', ')}\n`);

    let totalJobs = 0, totalPayments = 0, custInserted = 0;

    for (let offset = 0; offset < TOTAL_CUSTOMERS; offset += BATCH_SIZE) {
      const chunk = Math.min(BATCH_SIZE, TOTAL_CUSTOMERS - offset);

      // ── 1. Insert customers ─────────────────────────────────────────────
      const custRows = [];
      for (let i = 0; i < chunk; i++) {
        // Evenly distribute across branches
        const branchId = BRANCH_IDS[Math.floor((offset + i) * BRANCH_IDS.length / TOTAL_CUSTOMERS)];
        custRows.push([
          randomMobile(mobileCounter++),
          randomName(),
          pick(CUSTOMER_TYPES),
          null, null, null,
          branchId,
        ]);
      }
      await conn.query(
        `INSERT IGNORE INTO sarga_customers
           (mobile, name, type, email, gst, address, branch_id) VALUES ?`,
        [custRows]);
      custInserted += chunk;

      // ── 2. Fetch back inserted customers ───────────────────────────────
      const mobiles = custRows.map(r => r[0]);
      const [custData] = await conn.query(
        `SELECT id, mobile, name, branch_id FROM sarga_customers WHERE mobile IN (?)`,
        [mobiles]);

      // ── 3. Build jobs ───────────────────────────────────────────────────
      const jobRows = [];
      const custJobInfo = [];  // for payment building

      for (const cust of custData) {
        const numJobs  = rand(1, 4);
        const myJobs   = [];

        for (let j = 0; j < numJobs; j++) {
          const jt         = pick(JOB_CATEGORIES);
          const qty        = rand(jt.minQty, jt.maxQty);
          const unitPrice  = +(rand(jt.minRate * 100, jt.maxRate * 100) / 100).toFixed(2);
          const total      = +(qty * unitPrice).toFixed(2);
          const roll       = Math.random();

          let advance, balance, payStatus, jobStatus;
          if (roll < 0.55) {
            advance = total; balance = 0;
            payStatus = 'Paid'; jobStatus = pick(['Completed', 'Delivered']);
          } else if (roll < 0.80) {
            const pct = rand(20, 80) / 100;
            advance = +(total * pct).toFixed(2); balance = +(total - advance).toFixed(2);
            payStatus = 'Partial'; jobStatus = pick(['Pending', 'Processing']);
          } else {
            advance = 0; balance = total;
            payStatus = 'Unpaid'; jobStatus = 'Pending';
          }

          const jobNum = `SEED-${String(jobCounter++).padStart(6,'0')}`;
          jobRows.push([
            cust.id, null, cust.branch_id,
            jobNum, `${pick(JOB_WORD)} ${jt.sub}`,
            `${jt.cat} - ${jt.sub}`,
            qty, unitPrice, total, advance, balance,
            payStatus, jobStatus, randomDate(365),
            jt.cat, jt.sub,
          ]);
          myJobs.push({ total, advance, balance, payStatus });
        }
        custJobInfo.push({ cust, jobs: myJobs });
      }

      if (jobRows.length > 0) {
        await conn.query(
          `INSERT IGNORE INTO sarga_jobs
             (customer_id, product_id, branch_id, job_number, job_name, description,
              quantity, unit_price, total_amount, advance_paid, balance_amount,
              payment_status, status, delivery_date, category, subcategory) VALUES ?`,
          [jobRows]);
        totalJobs += jobRows.length;
      }

      // ── 4. Build payments ───────────────────────────────────────────────
      const payRows = [];
      for (const { cust, jobs } of custJobInfo) {
        const paidJobs = jobs.filter(j => j.payStatus !== 'Unpaid');
        if (paidJobs.length === 0) continue;

        const billAmt  = +paidJobs.reduce((s,j) => s + j.total,   0).toFixed(2);
        const advAmt   = +paidJobs.reduce((s,j) => s + j.advance, 0).toFixed(2);
        const balAmt   = +(billAmt - advAmt).toFixed(2);
        const method   = pick(PAY_METHODS);
        const cash     = method === 'UPI'  ? 0
                       : method === 'Both' ? +(advAmt / 2).toFixed(2)
                       : advAmt;
        const upi      = method === 'Cash' ? 0
                       : method === 'Both' ? +(advAmt - cash).toFixed(2)
                       : advAmt;

        payRows.push([
          cust.id, cust.name, cust.mobile,
          billAmt, billAmt, billAmt, 0, 0,
          advAmt, balAmt,
          method, cash, upi,
          cust.branch_id, null, 'Seeded test data',
          randomDate(365), JSON.stringify([]),
        ]);
      }

      if (payRows.length > 0) {
        await conn.query(
          `INSERT INTO sarga_customer_payments
             (customer_id, customer_name, customer_mobile,
              bill_amount, total_amount, net_amount, sgst_amount, cgst_amount,
              advance_paid, balance_amount, payment_method, cash_amount, upi_amount,
              branch_id, reference_number, description, payment_date, order_lines) VALUES ?`,
          [payRows]);
        totalPayments += payRows.length;
      }

      const pct = Math.floor(((offset + chunk) / TOTAL_CUSTOMERS) * 100);
      process.stdout.write(`\r    ${(offset + chunk).toLocaleString()}/${TOTAL_CUSTOMERS.toLocaleString()} customers (${pct}%)  `);
    }

    // ── summary ─────────────────────────────────────────────────────────────
    console.log('\n');
    console.log('═══════════════════════════════════════');
    console.log(`✅  Seeding complete!`);
    console.log(`    Customers : ${custInserted.toLocaleString()}`);
    console.log(`    Jobs      : ${totalJobs.toLocaleString()}`);
    console.log(`    Payments  : ${totalPayments.toLocaleString()}`);
    console.log('═══════════════════════════════════════');

    const [branchSum] = await conn.query(`
      SELECT b.name AS branch,
             COUNT(DISTINCT c.id)   AS customers,
             COUNT(DISTINCT j.id)   AS jobs,
             COUNT(DISTINCT p.id)   AS payments
      FROM sarga_branches b
      LEFT JOIN sarga_customers c         ON c.branch_id = b.id AND c.name LIKE 'Test %'
      LEFT JOIN sarga_jobs j              ON j.customer_id = c.id
      LEFT JOIN sarga_customer_payments p ON p.customer_id = c.id
      WHERE b.id IN (${BRANCH_IDS.join(',')})
      GROUP BY b.id, b.name`);
    console.log('\n📊  Per-branch breakdown (seeded rows only):');
    console.table(branchSum);

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY single-row seed kept below (unused, harmless)
// ─────────────────────────────────────────────────────────────────────────────
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
