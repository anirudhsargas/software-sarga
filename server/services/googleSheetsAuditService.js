const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../helpers/logger');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = process.env.GOOGLE_AUDIT_SHEET_TAB || 'AUDIT_LOGS';
const MAX_ROWS = Math.max(1000, Number.parseInt(process.env.GOOGLE_AUDIT_MAX_ROWS || '50000', 10));
const HEADERS = [
  'audit_id','timestamp','user_id_internal','username','employee_name','user_role','branch_id','branch_name','department',
  'module','action_type','record_type','record_id','document_number','previous_values','new_values','changed_fields',
  'ip_address','device_name','browser','operating_system','session_id','api_endpoint','response_status','success',
  'error_message','reason_remarks','latitude','longitude','duration_ms','previous_hash','current_hash',
  'legacy_action','legacy_details','entity_type','entity_id','field_name','old_value','new_value'
];
let tabId;
let setupPromise;

function getSheets() {
  const raw = process.env.GOOGLE_SA_KEY || process.env.GOOGLE_SERVICE_ACCOUNT;
  let credentials;
  if (raw && raw.trim().startsWith('{')) credentials = JSON.parse(raw);
  else if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) credentials = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  else if (raw) credentials = JSON.parse(raw);
  if (!credentials || !SPREADSHEET_ID) throw new Error('Google Sheets credentials or GOOGLE_SHEET_ID are not configured.');
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}

const cell = (v) => v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : (typeof v === 'object' ? JSON.stringify(v) : String(v));
const colLetter = (n) => { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const rowOf = (entry) => HEADERS.map((key) => cell(entry[key]));

async function ensureTab() {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const sheets = getSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets(properties(sheetId,title))' });
    const existing = (meta.data.sheets || []).find(s => s.properties.title === TAB);
    if (existing) {
      tabId = existing.properties.sheetId;
      const header = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${TAB}!A1:${colLetter(HEADERS.length)}1` });
      if (!header.data.values?.length) await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${TAB}!A1:${colLetter(HEADERS.length)}1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } });
      else if (HEADERS.some((name, i) => header.data.values[0][i] !== name)) throw new Error(`The ${TAB} header does not match the app's audit schema. Rename the existing tab or migrate its rows before enabling audit writes.`);
    } else {
      const added = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { rowCount: Math.min(MAX_ROWS + 1, 1000), columnCount: HEADERS.length } } } }] } });
      tabId = added.data.replies?.[0]?.addSheet?.properties?.sheetId;
      await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${TAB}!A1:${colLetter(HEADERS.length)}1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } });
    }
    return sheets;
  })().catch((err) => { setupPromise = null; throw err; });
  return setupPromise;
}

async function appendAuditEntries(entries) {
  if (!entries.length) return { appended: 0, trimmed: 0 };
  const sheets = await ensureTab();
  const range = `${TAB}!A:${colLetter(HEADERS.length)}`;
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${TAB}!A:B` });
  const existingRows = (existing.data.values || []).slice(1);
  const overflow = Math.max(0, existingRows.length + entries.length - MAX_ROWS);
  let trimmed = 0;
  let acceptedEntries = entries;
  if (overflow) {
    const removeCount = Math.min(existingRows.length + entries.length, overflow + Math.max(1, Math.ceil(MAX_ROWS * 0.05)));
    const candidates = [
      ...existingRows.map((row, i) => ({ type: 'existing', index: i, timestamp: String(row[1] || '') })),
      ...entries.map((entry, i) => ({ type: 'incoming', index: i, timestamp: String(entry.timestamp || '') })),
    ].sort((a,b) => a.timestamp.localeCompare(b.timestamp));
    const remove = candidates.slice(0, removeCount);
    const incomingRemove = new Set(remove.filter(x => x.type === 'incoming').map(x => x.index));
    const rowIndexes = remove.filter(x => x.type === 'existing').map(x => x.index + 1).sort((a,b) => a-b);
    if (rowIndexes.length) {
      const ranges = [];
      for (const index of rowIndexes) {
        const previous = ranges[ranges.length - 1];
        if (previous && previous.endIndex === index) previous.endIndex += 1;
        else ranges.push({ startIndex: index, endIndex: index + 1 });
      }
      const requests = ranges.reverse().map(range => ({ deleteDimension: { range: { sheetId: tabId, dimension: 'ROWS', ...range } } }));
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
    }
    acceptedEntries = entries.filter((_, i) => !incomingRemove.has(i));
    trimmed = removeCount;
    logger.warn(`[AuditSheets] Retention removed ${removeCount} oldest rows from ${TAB}.`);
  }
  const values = acceptedEntries.map(rowOf);
  if (!values.length) return { appended: 0, trimmed };
  for (const row of values) if (row.some(v => v.length > 49000)) throw new Error('Audit row exceeds Google Sheets 50,000-character cell limit.');
  await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
  return { appended: acceptedEntries.length, trimmed };
}

async function readAuditRows() {
  const sheets = await ensureTab();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${TAB}!A:${colLetter(HEADERS.length)}`, valueRenderOption: 'UNFORMATTED_VALUE' });
  const values = response.data.values || [];
  if (values.length < 2) return [];
  const header = values[0];
  return values.slice(1).map((row, index) => {
    const entry = Object.fromEntries(header.map((key, i) => [key, row[i] ?? '']));
    entry.id = index + 1;
    for (const key of ['user_id_internal','branch_id','entity_id','response_status','duration_ms']) if (entry[key] !== '') entry[key] = Number(entry[key]) || entry[key];
    for (const key of ['previous_values','new_values','changed_fields']) if (entry[key]) { try { entry[key] = JSON.parse(entry[key]); } catch (_) {} }
    entry.success = entry.success === true || entry.success === 1 || entry.success === '1' || entry.success === 'true';
    return entry;
  });
}

async function migrateMysqlAudit(pool) {
  const seen = new Set((await readAuditRows()).map(row => String(row.audit_id || '')));
  let migrated = 0;
  const pageSize = 500;
  for (const [table, kind] of [['sarga_audit_logs','legacy'], ['sarga_enterprise_audit','enterprise']]) {
    let offset = 0;
    while (true) {
      let rows;
      try { [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY id LIMIT ? OFFSET ?`, [pageSize, offset]); }
      catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146) break;
        throw error;
      }
      if (!rows.length) break;
      const mapped = rows.map(row => {
        const auditId = kind === 'enterprise' ? row.audit_id : `legacy-${row.id}`;
        if (seen.has(String(auditId))) return null;
        seen.add(String(auditId));
        if (kind === 'enterprise') return { ...row, audit_id: auditId };
        return {
          audit_id: auditId, timestamp: row.timestamp, user_id_internal: row.user_id_internal,
          module: row.entity_type || 'General', action_type: row.action, record_type: row.entity_type,
          record_id: row.entity_id, ip_address: row.ip_address, legacy_action: row.action,
          legacy_details: row.details, entity_type: row.entity_type, entity_id: row.entity_id,
          field_name: row.field_name, old_value: row.old_value, new_value: row.new_value,
          success: true,
        };
      }).filter(Boolean);
      if (mapped.length) {
        await appendAuditEntries(mapped);
        migrated += mapped.length;
      }
      offset += rows.length;
    }
  }
  return { migrated };
}

module.exports = { appendAuditEntries, readAuditRows, migrateMysqlAudit, HEADERS, MAX_ROWS };
