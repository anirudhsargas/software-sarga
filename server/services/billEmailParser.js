const Imap = require('imap');
const { pool } = require('../database');

const FROM_ADDRESS = 'hdfcbankbillpay@billdesk.in';
const SUBJECT_ACCEPT = /new bill presented for payment/i;
const SUBJECT_SKIP = [/scheduled payment/i, /payment processed/i, /payment successful/i];

function parseAmount(raw) {
  if (!raw) return null;
  const num = String(raw).replace(/[^0-9.]/g, '');
  const v = parseFloat(num || '0');
  return Number.isFinite(v) ? v : null;
}

function parseDueDate(raw) {
  if (!raw) return null;
  // Expecting formats like 09-Apr-2026 or 9-Apr-2026
  const m = String(raw).trim();
  const parts = m.split(/[-\s]/).filter(Boolean);
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const monStr = parts[1].slice(0,3).toLowerCase();
    const year = parts[2];
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mm = months[monStr] || null;
    if (mm) return `${year}-${mm}-${day}`;
    // fallback to ISO parse
    const dt = new Date(m);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0,10);
  }
  return null;
}

function mapBillerName(name) {
  if (!name) return 'Unknown';
  const n = String(name).toLowerCase();
  if (n.includes('kerala') && n.includes('electricity')) return 'KSEB';
  if (n.includes('airtel')) return 'Airtel';
  if (n.includes('bsnl')) return 'BSNL';
  if (n.includes('act')) return 'ACT';
  // default first word
  return String(name).split(/\s+/)[0] || name;
}

function extractFields(text) {
  if (!text) return null;
  const t = String(text);

  const billerMatch = t.match(/Biller\s*Name\s*:\s*(.+)/i) || t.match(/Biller\s*:\s*(.+)/i);
  const consumerMatch = t.match(/Consumer\s*Number\s*:\s*([A-Za-z0-9-]+)/i) || t.match(/Consumer\s*No\.?\s*:\s*([A-Za-z0-9-]+)/i);
  const amountMatch = t.match(/Bill\s*Amount\s*\(Rs\.\)\s*:\s*([^\r\n]+)/i) || t.match(/Amount\s*Due\s*:\s*([^\r\n]+)/i);
  const dueMatch = t.match(/Bill\s*Due\s*Date\s*:\s*([^\r\n]+)/i) || t.match(/Due\s*Date\s*:\s*([^\r\n]+)/i);

  const biller = billerMatch ? billerMatch[1].trim() : null;
  const consumer = consumerMatch ? consumerMatch[1].trim() : null;
  const amountRaw = amountMatch ? amountMatch[1].trim() : null;
  const dueRaw = dueMatch ? dueMatch[1].trim() : null;

  const amount = parseAmount(amountRaw);
  const bill_date = parseDueDate(dueRaw);

  if (!consumer || !amount || !bill_date) return null;
  return { biller, consumer, amount, bill_date };
}

async function processParsedEmail(parsed, uid, imap) {
  try {
    const subject = parsed.subject || '';
    console.log(`Processing email UID=${uid} Subject="${subject}"`);

    // Skip confirmations
    for (const rx of SUBJECT_SKIP) {
      if (rx.test(subject)) {
        console.log(`Skipped payment confirmation email: ${subject}`);
        return { skipped: true, reason: 'payment_confirmation' };
      }
    }

    if (!SUBJECT_ACCEPT.test(subject)) {
      console.log(`Skipped email (subject filter): ${subject}`);
      return { skipped: true, reason: 'subject_mismatch' };
    }

    const text = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
    const fields = extractFields(text);
    if (!fields) {
      console.warn('Failed to extract fields from email, skipping');
      return { skipped: true, reason: 'parse_failed' };
    }

    const { biller, consumer, amount, bill_date } = fields;
    console.log(`Parsed bill: ${biller} | Consumer: ${consumer} | Amount: ${amount} | Due: ${bill_date}`);

    const utility_type = mapBillerName(biller);

    // determine branch_id from existing utility bills with same connection_id
    let branch_id = 1;
    try {
      const [rows] = await pool.query('SELECT branch_id FROM sarga_utility_bills WHERE connection_id = ? LIMIT 1', [consumer]);
      if (rows && rows[0] && rows[0].branch_id) branch_id = rows[0].branch_id;
    } catch (err) {
      console.warn('Branch lookup failed:', err.message);
    }
    console.log(`Matched branch_id: ${branch_id} for connection_id: ${consumer}`);

    // Ensure this consumer/connection is recorded in utility connections for the branch
    try {
      const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM sarga_utility_connections WHERE branch_id = ? AND utility_type = ? AND connection_id = ?', [branch_id, utility_type, consumer]);
      if (Number(cnt) === 0) {
        await pool.query('INSERT INTO sarga_utility_connections (branch_id, utility_type, connection_id, label, created_at) VALUES (?, ?, ?, ?, NOW())', [branch_id, utility_type, consumer, consumer]);
      }
    } catch (err) {
      console.warn('Connection insert failed:', err.message);
    }

    // Duplicate check
    try {
      const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM sarga_utility_bills WHERE connection_id = ? AND bill_date = ?', [consumer, bill_date]);
      if (Number(cnt) > 0) {
        console.log(`Skipped duplicate: ${consumer} for ${bill_date}`);
        return { skipped: true, reason: 'duplicate' };
      }
    } catch (err) {
      console.warn('Duplicate check failed:', err.message);
    }

    // Insert
    try {
      await pool.query(
        `INSERT INTO sarga_utility_bills (utility_type, branch_id, bill_number, bill_date, amount, description, connection_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [utility_type, branch_id, consumer, bill_date, amount, 'Auto-imported from HDFC BillPay email', consumer]
      );
      console.log(`Inserted new utility bill for ${biller} - Rs.${amount}`);
      return { inserted: true };
    } catch (err) {
      console.error('DB insert failed:', err.message);
      return { skipped: true, reason: 'db_error', error: err.message };
    }
  } finally {
    // mark as seen to avoid reprocessing
    try {
      if (imap && uid) imap.addFlags(uid, '\\Seen', () => {});
    } catch (e) { /* ignore */ }
  }
}

async function runBillParser() {
  console.log('Bill parser started');
  const report = { found: 0, processed: 0, inserted: 0, skipped: 0, errors: [] };

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    const msg = 'GMAIL_USER or GMAIL_APP_PASSWORD not configured';
    console.warn(msg);
    report.errors.push(msg);
    return report;
  }

  return new Promise((resolve) => {
    let finished = false;
    const imap = new Imap({
      user: gmailUser,
      password: gmailPass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    function safeFinish() {
      if (finished) return;
      finished = true;
      try { imap.end(); } catch (e) { /* ignore */ }
      resolve(report);
    }

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { report.errors.push(err.message); return safeFinish(); }
        imap.search(['UNSEEN', ['FROM', FROM_ADDRESS]], (err, results) => {
          if (err) { report.errors.push(err.message); return safeFinish(); }
          if (!results || results.length === 0) {
            console.log('Found 0 unseen emails from HDFC BillPay');
            return safeFinish();
          }
          console.log(`Found ${results.length} unseen emails from HDFC BillPay`);
          report.found = results.length;

          const f = imap.fetch(results, { bodies: '', struct: true, markSeen: false });

          f.on('message', (msg, seqno) => {
            let uid = null;
            let envelope = null;
            msg.once('attributes', (attrs) => { uid = attrs.uid; envelope = attrs.envelope; });

            msg.on('body', (stream) => {
              // Read raw stream into string and perform simple parsing
              const chunks = [];
              stream.on('data', (chunk) => chunks.push(chunk));
              stream.on('end', async () => {
                try {
                  const raw = Buffer.concat(chunks).toString('utf8');
                  // Attempt to get subject from envelope, fallback to raw headers
                  const subject = (envelope && envelope.subject) ? String(envelope.subject) : ((raw.match(/^Subject:\s*(.+)$/mi) || [])[1] || '');
                  // Strip headers (up to first blank line) to get body
                  const bodyMatch = raw.split(/\r?\n\r?\n/);
                  const body = bodyMatch.length > 1 ? bodyMatch.slice(1).join('\n\n') : raw;
                  // Remove simple HTML tags if present
                  const text = body.replace(/<[^>]+>/g, ' ');
                  const parsed = { subject, text };
                  report.processed += 1;
                  const res = await processParsedEmail(parsed, uid, imap);
                  if (res && res.inserted) report.inserted += 1;
                  if (res && res.skipped) report.skipped += 1;
                } catch (err) {
                  console.error('Failed to parse/process raw email:', err.message);
                  report.errors.push(err.message);
                  if (imap && uid) try { imap.addFlags(uid, '\\Seen', () => {}); } catch (e) {}
                }
              });
            });

            msg.once('end', () => { /* message finished */ });
          });

          f.once('error', (err) => {
            console.error('Fetch error:', err.message);
            report.errors.push(err.message);
          });

          f.once('end', () => {
            // All messages processed; close connection
            safeFinish();
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('IMAP connection error:', err.message);
      report.errors.push(err.message);
      safeFinish();
    });

    imap.once('end', () => {
      // connection ended
      // ensure we resolve if not already
      if (!finished) resolve(report);
    });

    try { imap.connect(); } catch (e) { report.errors.push(e.message); safeFinish(); }
  });
}

module.exports = { runBillParser };
