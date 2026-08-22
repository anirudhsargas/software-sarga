// Migration 042: Multi-book support for mixed invoices
// 1. Adds book_type ENUM('Offset','Laser','Other') to sarga_jobs
// 2. Adds payment_target_book ENUM('Offset','Laser','Other') to sarga_customer_payments
// 3. Backfills data from existing order_lines JSON and legacy book_type

module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'sarga_db';
  console.log('[Migration 042] Starting multi-book schema migration...');

  // 1. Add book_type to sarga_jobs if missing
  const [jobCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_jobs' AND COLUMN_NAME = 'book_type'`,
    [dbName]
  );
  if (jobCols.length === 0) {
    await connection.query(
      `ALTER TABLE sarga_jobs
       ADD COLUMN book_type ENUM('Offset', 'Laser', 'Other') NOT NULL DEFAULT 'Offset' AFTER category`
    );
    console.log('[Migration 042] Added book_type column to sarga_jobs');
  } else {
    console.log('[Migration 042] book_type column already exists in sarga_jobs');
  }

  // 2. Add payment_target_book to sarga_customer_payments if missing
  const [payCols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sarga_customer_payments' AND COLUMN_NAME = 'payment_target_book'`,
    [dbName]
  );
  if (payCols.length === 0) {
    await connection.query(
      `ALTER TABLE sarga_customer_payments
       ADD COLUMN payment_target_book ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset' AFTER book_type`
    );
    console.log('[Migration 042] Added payment_target_book column to sarga_customer_payments');
  } else {
    console.log('[Migration 042] payment_target_book column already exists in sarga_customer_payments');
  }

  // 3. Backfill payment_target_book on sarga_customer_payments
  await connection.query(
    `UPDATE sarga_customer_payments
     SET payment_target_book = CASE
       WHEN book_type IN ('Offset', 'Laser', 'Other') THEN book_type
       ELSE 'Offset'
     END
     WHERE payment_target_book IS NULL`
  );
  console.log('[Migration 042] Backfilled payment_target_book on sarga_customer_payments');

  // 4. Backfill sarga_jobs.book_type using order_lines JSON or category / parent payment
  const [payments] = await connection.query(
    `SELECT id, order_lines, payment_target_book, book_type FROM sarga_customer_payments WHERE order_lines IS NOT NULL`
  );

  for (const cp of payments) {
    const defaultBook = cp.payment_target_book || cp.book_type || 'Offset';
    let lines = [];
    try {
      lines = typeof cp.order_lines === 'string' ? JSON.parse(cp.order_lines) : (cp.order_lines || []);
    } catch (_e) {
      lines = [];
    }

    const [jobs] = await connection.query(`SELECT id, product_id, category, job_name FROM sarga_jobs WHERE payment_id = ?`, [cp.id]);

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const matchedLine = lines[i] || lines.find(l => l.job_id === job.id || l.product_id === job.product_id);
      
      let lineBook = matchedLine?.book_type || matchedLine?.bookType;

      if (!lineBook) {
        const cat = String(job.category || matchedLine?.category || '').toLowerCase();
        if (cat.includes('laser') || cat.includes('photocopy') || cat.includes('digital')) {
          lineBook = 'Laser';
        } else if (cat.includes('offset')) {
          lineBook = 'Offset';
        } else {
          lineBook = defaultBook;
        }
      }

      const normalizedBook = ['Offset', 'Laser', 'Other'].includes(lineBook) ? lineBook : defaultBook;

      await connection.query(`UPDATE sarga_jobs SET book_type = ? WHERE id = ?`, [normalizedBook, job.id]);
    }
  }

  // Fallback update for any orphan jobs without payment_id
  await connection.query(
    `UPDATE sarga_jobs
     SET book_type = CASE
       WHEN LOWER(category) LIKE '%laser%' OR LOWER(category) LIKE '%photocopy%' OR LOWER(category) LIKE '%digital%' THEN 'Laser'
       WHEN LOWER(category) LIKE '%offset%' THEN 'Offset'
       ELSE 'Offset'
     END
     WHERE book_type IS NULL OR book_type = ''`
  );

  console.log('[Migration 042] Completed sarga_jobs.book_type backfill.');
};
