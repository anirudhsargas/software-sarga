const { google } = require('googleapis');

// Parse service account key from env
function getAuth() {
  let keyString = process.env.GOOGLE_SA_KEY || process.env.GOOGLE_SERVICE_ACCOUNT;
  
  if (!keyString && process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    keyString = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
  }
  
  if (!keyString) {
    throw new Error('Google Service Account Key is not set in environment (GOOGLE_SA_KEY, GOOGLE_SERVICE_ACCOUNT, or GOOGLE_SERVICE_ACCOUNT_BASE64)');
  }
  
  const key = JSON.parse(keyString);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Table config: name, sheet tab name, strategy
const TABLE_CONFIG = [
  // Append strategy: only new rows since last backup
  { table: 'sarga_bills_documents',         sheet: 'RAW_Bills',        strategy: 'append',  dateCol: 'created_at' },
  { table: 'sarga_jobs',                    sheet: 'RAW_Jobs',         strategy: 'append',  dateCol: 'created_at' },
  { table: 'sarga_daily_expenses',          sheet: 'RAW_Expenses',     strategy: 'append',  dateCol: 'created_at' },
  { table: 'sarga_staff_attendance',        sheet: 'RAW_Attendance',   strategy: 'append',  dateCol: 'attendance_date' },
  { table: 'sarga_daily_credit_transactions', sheet: 'RAW_CreditTxns', strategy: 'append',  dateCol: 'created_at' },
  // Full replace strategy: clear sheet and rewrite all rows
  { table: 'sarga_customers',              sheet: 'RAW_Customers',    strategy: 'replace' },
  { table: 'sarga_inventory',             sheet: 'RAW_Inventory',    strategy: 'replace' },
  { table: 'sarga_staff',                 sheet: 'RAW_Staff',        strategy: 'replace' },
];

// Ensure a sheet tab exists; create it if not
async function ensureSheet(sheetsApi, sheetName) {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
  if (!exists) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }]
      }
    });
  }
}

// Write rows to a sheet tab (replaces all data including header)
async function writeToSheet(sheetsApi, sheetName, rows) {
  if (!rows || rows.length === 0) return 0;
  const range = `${sheetName}!A1`;
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:ZZ`
  });
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: rows }
  });
  return rows.length - 1; // minus header row
}

// Append rows to a sheet tab (header only written if sheet is empty)
async function appendToSheet(sheetsApi, sheetName, rows) {
  if (!rows || rows.length === 0) return 0;
  // Check if sheet has data already
  const existing = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:A2`
  });
  const hasHeader = existing.data.values && existing.data.values.length > 0;
  const rowsToWrite = hasHeader ? rows.slice(1) : rows; // skip header if already written
  if (rowsToWrite.length === 0) return 0;
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rowsToWrite }
  });
  return rowsToWrite.length;
}

// Write a row to the CONTROL sheet for audit log
async function writeControlLog(sheetsApi, logRow) {
  await ensureSheet(sheetsApi, 'CONTROL');
  // Write header if sheet is empty
  const existing = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'CONTROL!A1:A2'
  });
  if (!existing.data.values || existing.data.values.length === 0) {
    await sheetsApi.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'CONTROL!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [['timestamp', 'table', 'rows_written', 'strategy', 'status', 'triggered_by', 'error']]
      }
    });
  }
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'CONTROL!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [logRow] }
  });
}

// Convert MySQL result rows to 2D array with header
function rowsTo2DArray(dbRows) {
  if (!dbRows || dbRows.length === 0) return [];
  const headers = Object.keys(dbRows[0]);
  const data = dbRows.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (val instanceof Date) return val.toISOString();
      return String(val);
    })
  );
  return [headers, ...data];
}

// Main backup function
async function runBackup(db, triggeredBy = 'cron') {
  const auth = getAuth();
  const sheetsApi = google.sheets({ version: 'v4', auth });

  // Record job start in MySQL
  const [jobResult] = await db.execute(
    `INSERT INTO sarga_backup_jobs (triggered_by, status, started_at) VALUES (?, 'running', NOW())`,
    [triggeredBy]
  );
  const jobId = jobResult.insertId;

  let totalRows = 0;
  const errors = [];
  const results = [];

  for (const config of TABLE_CONFIG) {
    try {
      await ensureSheet(sheetsApi, config.sheet);

      let dbRows = [];
      if (config.strategy === 'append') {
        // Get last backup time for this table from CONTROL sheet
        // Simple approach: fetch all rows since yesterday midnight
        const since = new Date();
        since.setDate(since.getDate() - 1);
        since.setHours(0, 0, 0, 0);
        const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');
        const [rows] = await db.execute(
          `SELECT * FROM \`${config.table}\` WHERE \`${config.dateCol}\` >= ? ORDER BY \`${config.dateCol}\` ASC`,
          [sinceStr]
        );
        dbRows = rows;
      } else {
        // Full replace: fetch all rows
        const [rows] = await db.execute(`SELECT * FROM \`${config.table}\` ORDER BY id ASC`);
        dbRows = rows;
      }

      const sheet2D = rowsTo2DArray(dbRows);
      let written = 0;

      if (config.strategy === 'append') {
        written = await appendToSheet(sheetsApi, config.sheet, sheet2D);
      } else {
        written = await writeToSheet(sheetsApi, config.sheet, sheet2D);
      }

      totalRows += written;
      results.push({ table: config.table, written, status: 'ok' });

      // Write to CONTROL log
      await writeControlLog(sheetsApi, [
        new Date().toISOString(),
        config.table,
        written,
        config.strategy,
        'success',
        triggeredBy,
        ''
      ]);

    } catch (err) {
      errors.push({ table: config.table, error: err.message });
      await writeControlLog(sheetsApi, [
        new Date().toISOString(),
        config.table,
        0,
        config.strategy || 'unknown',
        'error',
        triggeredBy,
        err.message
      ]);
    }
  }

  // Update job record
  const finalStatus = errors.length === 0 ? 'completed' : 'failed';
  const errorMsg = errors.length > 0 ? JSON.stringify(errors) : null;
  await db.execute(
    `UPDATE sarga_backup_jobs SET status = ?, completed_at = NOW(), tables_backed_up = ?, rows_written = ?, error_message = ? WHERE id = ?`,
    [finalStatus, TABLE_CONFIG.length - errors.length, totalRows, errorMsg, jobId]
  );

  return {
    jobId,
    status: finalStatus,
    tablesBackedUp: TABLE_CONFIG.length - errors.length,
    rowsWritten: totalRows,
    errors,
    results
  };
}

async function checkGoogleConnection() {
  const keyString = process.env.GOOGLE_SA_KEY || process.env.GOOGLE_SERVICE_ACCOUNT;
  const fallback = !keyString && process.env.GOOGLE_SERVICE_ACCOUNT_BASE64
    ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    : null;
  const resolved = keyString || fallback;

  if (!resolved) {
    return { status: 'credentials_missing', message: 'Google Service Account Key is not set (GOOGLE_SA_KEY, GOOGLE_SERVICE_ACCOUNT, or GOOGLE_SERVICE_ACCOUNT_BASE64)' };
  }

  let key;
  try {
    key = JSON.parse(resolved);
  } catch (e) {
    return { status: 'credentials_invalid', message: 'Service account JSON is malformed: ' + e.message };
  }

  if (!process.env.GOOGLE_SHEET_ID) {
    return { status: 'sheet_id_missing', message: 'GOOGLE_SHEET_ID is not set' };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheetsApi = google.sheets({ version: 'v4', auth });
    const start = Date.now();
    const meta = await sheetsApi.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      fields: 'properties.title'
    });
    const latency = Date.now() - start;
    return {
      status: 'healthy',
      serviceAccount: key.client_email || 'unknown',
      sheetTitle: meta.data.properties.title,
      latency
    };
  } catch (err) {
    if (err.code === 403 || err.code === 404) {
      return {
        status: 'sheet_not_shared',
        message: `Sheet "${process.env.GOOGLE_SHEET_ID}" is not accessible. Ensure it is shared with Editor access to ${key.client_email}.`,
        serviceAccount: key.client_email,
        error: err.message
      };
    }
    return {
      status: 'api_error',
      message: 'Google Sheets API error: ' + err.message,
      error: err.message
    };
  }
}

module.exports = { runBackup, checkGoogleConnection };
