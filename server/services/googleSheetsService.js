const { google } = require('googleapis');
const crypto = require('crypto');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const PAGE_SIZE = 500;
const MAX_CELL_CHARS = 49000;

// These are full snapshots. Incremental date windows can duplicate rows and miss
// changes to older records, so every successful run replaces these tabs atomically.
const TABLE_CONFIG = [
  { table: 'sarga_bills_documents', sheet: 'RAW_Bills' },
  { table: 'sarga_jobs', sheet: 'RAW_Jobs' },
  { table: 'sarga_daily_expenses', sheet: 'RAW_Expenses' },
  { table: 'sarga_staff_attendance', sheet: 'RAW_Attendance' },
  { table: 'sarga_daily_credit_transactions', sheet: 'RAW_CreditTxns' },
  { table: 'sarga_invoices', sheet: 'RAW_Invoices' },
  { table: 'sarga_customer_payments', sheet: 'RAW_Payments' },
  { table: 'sarga_orders', sheet: 'RAW_Orders' },
  { table: 'sarga_customer_designs', sheet: 'RAW_Designs' },
  { table: 'sarga_customers', sheet: 'RAW_Customers' },
  { table: 'sarga_inventory', sheet: 'RAW_Inventory' },
  { table: 'sarga_staff', sheet: 'RAW_Staff' },
  { table: 'vendors', sheet: 'RAW_Vendors' },
  { table: 'sarga_products', sheet: 'RAW_Products' },
  { table: 'sarga_machines', sheet: 'RAW_Machines' },
  { table: 'sarga_job_matter', sheet: 'RAW_JobMatter' },
  { table: 'sarga_job_staff_assignments', sheet: 'RAW_JobAssignments' },
  { table: 'sarga_job_status_history', sheet: 'RAW_JobStatus' },
  { table: 'sarga_paper_usage_logs', sheet: 'RAW_PaperUsage' },
  { table: 'sarga_job_proofs', sheet: 'RAW_JobProofs' },
  { table: 'sarga_refunds', sheet: 'RAW_Refunds' },
  { table: 'job_consumable_usage', sheet: 'RAW_JobConsumables' },
  { table: 'sarga_payment_transactions', sheet: 'RAW_PaymentTransactions' },
  { table: 'sarga_payments', sheet: 'RAW_ExpensesLedger' },
];

function getAuth() {
  let keyString = process.env.GOOGLE_SA_KEY || process.env.GOOGLE_SERVICE_ACCOUNT;
  let key;

  if (keyString && keyString.trim().startsWith('{')) {
    try { key = JSON.parse(keyString); } catch (_) { /* Try the base64 option next. */ }
  }
  if (!key && process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    try {
      key = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    } catch (_) { /* Report a useful error below. */ }
  }
  if (!key && keyString) {
    try { key = JSON.parse(keyString); } catch (error) {
      throw new Error(`Google service account JSON is invalid: ${error.message}`);
    }
  }
  if (!key) {
    throw new Error('Google service account credentials are missing. Set GOOGLE_SA_KEY, GOOGLE_SERVICE_ACCOUNT, or GOOGLE_SERVICE_ACCOUNT_BASE64.');
  }
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsApi() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeSheetRow(row, width) {
  const result = Array.isArray(row) ? row.slice(0, width).map(cellValue) : [];
  while (result.length < width) result.push('');
  return result;
}

function updateHash(hash, rows, width) {
  for (const row of rows) {
    hash.update(JSON.stringify(normalizeSheetRow(row, width)));
    hash.update('\n');
  }
}

function columnLetter(columnNumber) {
  let n = columnNumber;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function getSheetMap(sheetsApi) {
  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title))'
  });
  return new Map((response.data.sheets || []).map(sheet => [sheet.properties.title, sheet.properties.sheetId]));
}

async function addSheets(sheetsApi, names) {
  if (!names.length) return;
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: names.map(title => ({ addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: 26 } } } }))
    }
  });
}

async function writeAndVerifyTable(db, sheetsApi, config, stageName, sheetId) {
  const [columnRows] = await db.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [config.table]
  );
  if (!columnRows.length) throw new Error(`Source table ${config.table} does not exist.`);
  const columns = columnRows.map(row => row.COLUMN_NAME);
  const width = columns.length;
  if (sheetId === undefined) throw new Error(`Staging tab ${stageName} was not created.`);
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ updateSheetProperties: {
        properties: { sheetId, gridProperties: { rowCount: 1000, columnCount: Math.max(26, width) } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount'
      } }]
    }
  });
  const header = columns;
  const hash = crypto.createHash('sha256');
  updateHash(hash, [header], width);

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${stageName}!A1:${columnLetter(width)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header] }
  });
  let sourceRows = 0;
  let offset = 0;
  let sheetRow = 2;

  while (true) {
    const [rows] = await db.query(
      `SELECT * FROM \`${config.table}\` ORDER BY \`${columns[0]}\` LIMIT ? OFFSET ?`,
      [PAGE_SIZE, offset]
    );
    if (!rows.length) break;
    const values = rows.map(row => columns.map(column => cellValue(row[column])));
    for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
      const row = values[rowIndex];
      const tooLarge = row.findIndex(value => value.length > MAX_CELL_CHARS);
      if (tooLarge !== -1) {
        throw new Error(`${config.table}.${columns[tooLarge]} row ${offset + rowIndex + 1} exceeds Google Sheets' 50,000-character cell limit.`);
      }
    }

    const endRow = sheetRow + values.length - 1;
    if (endRow > 1000) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount: endRow } },
            fields: 'gridProperties.rowCount'
          } }]
        }
      });
    }
    const range = `${stageName}!A${sheetRow}:${columnLetter(width)}${endRow}`;
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    const readback = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    });
    const readRows = readback.data.values || [];
    if (readRows.length !== values.length) {
      throw new Error(`${config.table} read-back row count mismatch: wrote ${values.length}, read ${readRows.length}.`);
    }
    const expectedChunkHash = crypto.createHash('sha256');
    const actualChunkHash = crypto.createHash('sha256');
    updateHash(expectedChunkHash, values, width);
    updateHash(actualChunkHash, readRows, width);
    if (expectedChunkHash.digest('hex') !== actualChunkHash.digest('hex')) {
      throw new Error(`${config.table} read-back checksum mismatch at rows ${sheetRow}-${endRow}.`);
    }

    updateHash(hash, values, width);
    sourceRows += values.length;
    offset += values.length;
    sheetRow = endRow + 1;
  }

  return { table: config.table, sheet: config.sheet, rows: sourceRows, columns: width, sha256: hash.digest('hex'), verified: true };
}

async function publishStagedTabs(sheetsApi, configs, stageNames, jobId) {
  const sheetMap = await getSheetMap(sheetsApi);
  const requests = [];
  const oldTabs = [];

  for (const config of configs) {
    const stageName = stageNames.get(config.table);
    const stageId = sheetMap.get(stageName);
    if (stageId === undefined) throw new Error(`Staging tab ${stageName} disappeared before publish.`);
    const activeId = sheetMap.get(config.sheet);
    if (activeId !== undefined) {
      const oldName = `OLD_${jobId}_${config.sheet}`;
      oldTabs.push({ id: activeId, oldName, activeName: config.sheet, stageName, stageId });
      requests.push({ updateSheetProperties: { properties: { sheetId: activeId, title: oldName }, fields: 'title' } });
    }
    requests.push({ updateSheetProperties: { properties: { sheetId: stageId, title: config.sheet }, fields: 'title' } });
  }

  // Google applies the batch atomically. Until this succeeds, current RAW tabs remain untouched.
  if (requests.length) {
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  }

  return oldTabs;
}

async function rollbackPublishedTabs(sheetsApi, configs, stageNames, oldTabs) {
  const map = await getSheetMap(sheetsApi);
  const oldByActiveName = new Map(oldTabs.map(tab => [tab.activeName, tab]));
  const requests = [];
  for (const config of configs) {
    const currentId = map.get(config.sheet);
    const oldTab = oldByActiveName.get(config.sheet);
    if (oldTab) {
      requests.push({ updateSheetProperties: { properties: { sheetId: currentId, title: stageNames.get(config.table) }, fields: 'title' } });
      requests.push({ updateSheetProperties: { properties: { sheetId: oldTab.id, title: config.sheet }, fields: 'title' } });
    } else if (currentId !== undefined) {
      requests.push({ deleteSheet: { sheetId: currentId } });
    }
  }
  if (requests.length) {
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  }
}

async function removePreviousTabs(sheetsApi, oldTabs) {
  if (!oldTabs.length) return;
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: oldTabs.map(tab => ({ deleteSheet: { sheetId: tab.id } })) }
  });
}

async function removeStagedTabs(sheetsApi, stageNames) {
  const map = await getSheetMap(sheetsApi);
  const ids = [...stageNames.values()].map(name => map.get(name)).filter(id => id !== undefined);
  if (ids.length) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: ids.map(sheetId => ({ deleteSheet: { sheetId } })) }
    });
  }
}

async function appendManifest(sheetsApi, jobId, results, status, errorMessage = '') {
  const map = await getSheetMap(sheetsApi);
  if (!map.has('BACKUP_MANIFEST')) {
    await addSheets(sheetsApi, ['BACKUP_MANIFEST']);
  }
  const manifestHeader = ['job_id', 'completed_at_utc', 'status', 'table', 'rows', 'sha256', 'error'];
  const currentHeader = await sheetsApi.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'BACKUP_MANIFEST!A1:G1' });
  if (!currentHeader.data.values?.length) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'BACKUP_MANIFEST!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [manifestHeader] }
    });
  } else if (JSON.stringify(currentHeader.data.values[0]) !== JSON.stringify(manifestHeader)) {
    throw new Error('BACKUP_MANIFEST exists with an unexpected header; it was left unchanged.');
  }
  const timestamp = new Date().toISOString();
  const values = results.length
    ? results.map(result => [String(jobId), timestamp, status, result.table, String(result.rows), result.sha256 || '', errorMessage])
    : [[String(jobId), timestamp, status, '', '0', '', errorMessage]];
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'BACKUP_MANIFEST!A:G',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}

async function runBackup(db, triggeredBy = 'manual') {
  const sheetsApi = getSheetsApi();
  const connection = await db.getConnection();
  let lockAcquired = false;
  let jobId = null;
  const results = [];
  const stageNames = new Map();
  let oldTabs = [];
  let published = false;
  let snapshotTransactionActive = false;

  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('sarga_google_sheets_backup', 0) AS acquired");
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error('Another Google Sheets backup is already running.');

    await connection.execute(
      `UPDATE sarga_backup_jobs SET status = 'failed', completed_at = NOW(),
       error_message = 'Backup process ended before it could finish.'
       WHERE status = 'running' AND started_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)`
    );
    const [jobResult] = await connection.execute(
      `INSERT INTO sarga_backup_jobs (triggered_by, status, started_at) VALUES (?, 'running', NOW())`,
      [triggeredBy]
    );
    jobId = jobResult.insertId;

    const currentMap = await getSheetMap(sheetsApi);
    const newTabs = [];
    for (const config of TABLE_CONFIG) {
      const stageName = `STG_${jobId}_${config.sheet}`;
      stageNames.set(config.table, stageName);
      if (currentMap.has(stageName)) throw new Error(`Staging tab ${stageName} already exists; check for an interrupted run.`);
      newTabs.push(stageName);
    }
    await addSheets(sheetsApi, newTabs);
    const stagedMap = await getSheetMap(sheetsApi);

    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    snapshotTransactionActive = true;
    for (const config of TABLE_CONFIG) {
      const stageName = stageNames.get(config.table);
      results.push(await writeAndVerifyTable(connection, sheetsApi, config, stageName, stagedMap.get(stageName)));
    }
    await connection.commit();
    snapshotTransactionActive = false;

    oldTabs = await publishStagedTabs(sheetsApi, TABLE_CONFIG, stageNames, jobId);
    published = true;

    const rowsWritten = results.reduce((sum, result) => sum + result.rows, 0);
    await connection.execute(
      `UPDATE sarga_backup_jobs SET status = 'completed', completed_at = NOW(), tables_backed_up = ?, rows_written = ?, error_message = NULL WHERE id = ?`,
      [results.length, rowsWritten, jobId]
    );
    await appendManifest(sheetsApi, jobId, results, 'completed');
    try { await removePreviousTabs(sheetsApi, oldTabs); } catch (cleanupError) {
      console.warn('[backup] Snapshot published, but old-tab cleanup failed:', cleanupError.message);
    }
    return { jobId, status: 'completed', tablesBackedUp: results.length, rowsWritten, results };
  } catch (err) {
    if (snapshotTransactionActive) {
      try { await connection.rollback(); } catch (_) { /* Preserve the original backup error. */ }
      snapshotTransactionActive = false;
    }
    if (published) {
      try {
        await rollbackPublishedTabs(sheetsApi, TABLE_CONFIG, stageNames, oldTabs);
        published = false;
      } catch (rollbackError) {
        console.error('[backup] Failed to restore previous Sheets snapshot after publish error:', rollbackError.message);
      }
    }
    try { await removeStagedTabs(sheetsApi, stageNames); } catch (cleanupError) {
      console.warn('[backup] Failed to remove incomplete staging tabs:', cleanupError.message);
    }
    if (jobId !== null) {
      try {
        const safeError = String(err.message || err).slice(0, 2000);
        if (!published) {
          try { await appendManifest(sheetsApi, jobId, results, 'failed', safeError); } catch (_) { /* Preserve the original failure. */ }
        }
        await connection.execute(
          `UPDATE sarga_backup_jobs SET status = 'failed', completed_at = NOW(), tables_backed_up = ?, rows_written = ?, error_message = ? WHERE id = ?`,
          [results.length, results.reduce((sum, result) => sum + result.rows, 0), safeError, jobId]
        );
      } catch (_) { /* The backup status update must not hide the original error. */ }
    }
    throw err;
  } finally {
    if (lockAcquired) {
      try { await connection.query("SELECT RELEASE_LOCK('sarga_google_sheets_backup')"); } catch (_) { /* Connection close also releases it. */ }
    }
    connection.release();
  }
}

async function verifyBackup() {
  const sheetsApi = getSheetsApi();
  const map = await getSheetMap(sheetsApi);
  if (!map.has('BACKUP_MANIFEST')) {
    return { success: true, healthy: false, message: 'No verified backup manifest was found.', tables: [] };
  }
  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'BACKUP_MANIFEST!A:G',
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const rows = response.data.values || [];
  const header = rows[0] || [];
  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  const completed = rows.slice(1).filter(row => row[idx.status] === 'completed');
  if (!completed.length) {
    return { success: true, healthy: false, message: 'No completed backup is recorded in the manifest.', tables: [] };
  }
  const latestJobId = completed[completed.length - 1][idx.job_id];
  const latestRows = completed.filter(row => row[idx.job_id] === latestJobId);
  const expectedByTable = new Map(latestRows.map(row => [row[idx.table], {
    rows: Number(row[idx.rows] || 0),
    sha256: String(row[idx.sha256] || '')
  }]));
  const checks = [];

  for (const config of TABLE_CONFIG) {
    const expected = expectedByTable.get(config.table);
    if (!expected) {
      checks.push({ table: config.table, healthy: false, error: 'Table is missing from the latest backup manifest.' });
      continue;
    }
    if (!map.has(config.sheet)) {
      checks.push({ table: config.table, healthy: false, error: `Backup tab ${config.sheet} is missing.` });
      continue;
    }
    const [columns] = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${config.sheet}!1:1`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const headerRow = columns.values?.[0] || [];
    if (!headerRow.length) {
      checks.push({ table: config.table, healthy: false, error: 'Backup header row is empty.' });
      continue;
    }
    const width = headerRow.length;
    const hash = crypto.createHash('sha256');
    updateHash(hash, [headerRow], width);
    let actualRows = 0;
    let start = 2;
    while (true) {
      const end = start + PAGE_SIZE - 1;
      const values = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${config.sheet}!A${start}:${columnLetter(width)}${end}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER'
      });
      const page = values.data.values || [];
      if (!page.length) break;
      updateHash(hash, page, width);
      actualRows += page.length;
      if (page.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
    const actualHash = hash.digest('hex');
    const healthy = actualRows === expected.rows && actualHash === expected.sha256;
    checks.push({
      table: config.table,
      expected_rows: expected.rows,
      actual_rows: actualRows,
      healthy,
      ...(healthy ? {} : { expected_sha256: expected.sha256, actual_sha256: actualHash })
    });
  }

  const healthy = checks.length === TABLE_CONFIG.length && checks.every(check => check.healthy);
  return {
    success: true,
    healthy,
    jobId: Number(latestJobId),
    checkedAt: new Date().toISOString(),
    tables: checks,
    message: healthy ? 'Latest Sheets snapshot passed row-count and SHA-256 checks.' : 'Latest Sheets snapshot does not match its verified manifest.'
  };
}

async function checkGoogleConnection() {
  try {
    const auth = getAuth();
    const sheetsApi = google.sheets({ version: 'v4', auth });
    const start = Date.now();
    const meta = await sheetsApi.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'properties.title,sheets.properties.title'
    });
    return {
      status: 'healthy',
      sheetTitle: meta.data.properties.title,
      tabsAvailable: (meta.data.sheets || []).length,
      latency: Date.now() - start
    };
  } catch (err) {
    if (err.code === 403 || err.code === 404) {
      return { status: 'sheet_not_shared', message: `Google Sheet is not accessible to the configured service account. ${err.message}`, error: err.message };
    }
    return { status: 'api_error', message: 'Google Sheets API error: ' + err.message, error: err.message };
  }
}

module.exports = { runBackup, verifyBackup, checkGoogleConnection, TABLE_CONFIG };
