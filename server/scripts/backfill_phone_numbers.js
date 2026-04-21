#!/usr/bin/env node
/**
 * Backfill script: normalize phone_numbers.number_raw -> number_e164
 * - Requires `google-libphonenumber` and `mysql2` installed in the project.
 * - Usage example:
 *     DB_HOST=localhost DB_USER=root DB_PASS=yourpass DB_NAME=sarga node server/scripts/backfill_phone_numbers.js
 * - Produces `server/migrations/phone_conflicts_2026_04_17.json` if duplicates are found.
 */

const fs = require('fs');
const path = require('path');

let libphonenumber;
try {
  libphonenumber = require('google-libphonenumber');
} catch (err) {
  console.error('Missing dependency: google-libphonenumber');
  console.error('Install with: npm install google-libphonenumber --save');
  process.exit(1);
}

const { PhoneNumberUtil, PhoneNumberFormat } = libphonenumber;
const phoneUtil = PhoneNumberUtil.getInstance();
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'sarga';
const DEFAULT_REGION = (process.env.DEFAULT_REGION || 'IN').toUpperCase();

function deriveRegion(countryInput) {
  if (!countryInput) return DEFAULT_REGION;
  const s = String(countryInput).trim();
  // If numeric like +91 or 91
  if (/^\+?\d+$/.test(s)) {
    const cc = parseInt(s.replace(/\D/g, ''), 10);
    try {
      const region = phoneUtil.getRegionCodeForCountryCode(cc);
      return region || DEFAULT_REGION;
    } catch (_) {
      return DEFAULT_REGION;
    }
  }
  // If two-letter region code (e.g., IN, US)
  if (s.length === 2) return s.toUpperCase();
  return DEFAULT_REGION;
}

async function main() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });

  console.log('Connected to DB', DB_HOST, DB_NAME);

  const [rows] = await conn.execute(
    `SELECT id, customer_id, number_raw, country_code FROM phone_numbers WHERE number_raw IS NOT NULL AND (number_e164 IS NULL OR number_e164 = '')`
  );

  console.log('Found', rows.length, 'phone_numbers to process');

  for (const r of rows) {
    const id = r.id;
    const raw = String(r.number_raw || '').trim();
    if (!raw) continue;
    const region = deriveRegion(r.country_code);
    try {
      const parsed = phoneUtil.parse(raw, region);
      if (!phoneUtil.isValidNumber(parsed)) {
        console.warn('Invalid number (skipping):', id, raw, 'region', region);
        continue;
      }
      const e164 = phoneUtil.format(parsed, PhoneNumberFormat.E164);
      await conn.execute(
        'UPDATE phone_numbers SET number_e164 = ?, country_code = ? WHERE id = ?',
        [e164, region, id]
      );
      console.log('OK:', id, raw, '->', e164);
    } catch (err) {
      console.warn('Parse error for id', id, raw, err && err.message);
    }
  }

  // Find duplicates (conflicts)
  const [dups] = await conn.execute(
    `SELECT number_e164, COUNT(*) cnt FROM phone_numbers WHERE number_e164 IS NOT NULL GROUP BY number_e164 HAVING cnt > 1`
  );

  if (dups.length === 0) {
    console.log('No duplicates found. Backfill complete.');
    await conn.end();
    return;
  }

  const conflicts = {};
  for (const d of dups) {
    const e164 = d.number_e164;
    const [dupRows] = await conn.execute('SELECT * FROM phone_numbers WHERE number_e164 = ?', [e164]);
    conflicts[e164] = dupRows;
  }

  const outPath = path.join(__dirname, '..', 'migrations', 'phone_conflicts_2026_04_17.json');
  fs.writeFileSync(outPath, JSON.stringify(conflicts, null, 2), 'utf8');
  console.log('Conflicts written to', outPath);

  await conn.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err && err.stack);
  process.exit(1);
});
// Backfill script: normalize phone numbers and populate phone_numbers.number_e164
// Usage:
//   npm install google-libphonenumber mysql2
//   DB_HOST=localhost DB_USER=root DB_PASS=xxx DB_NAME=sarga node server/scripts/backfill_phone_numbers.js

const mysql = require('mysql2/promise');
const libph = require('google-libphonenumber');
const phoneUtil = libph.PhoneNumberUtil.getInstance();
const PNF = libph.PhoneNumberFormat;

const CONFLICTS_OUT = 'server/migrations/phone_conflicts_2026_04_17.json';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'sarga',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  });

  const [rows] = await conn.execute('SELECT id, customer_id, number_raw, number_e164 FROM phone_numbers');
  const conflicts = [];

  for (const r of rows) {
    const raw = (r.number_raw || '').toString().trim();
    if (!raw) continue;

    let e164 = null;
    let country = null;

    try {
      let parsed;
      if (raw.startsWith('+')) {
        parsed = phoneUtil.parse(raw);
      } else if (/^\d{10}$/.test(raw)) {
        // common case: 10-digit Indian mobile — guess IN
        parsed = phoneUtil.parse(raw, 'IN');
      } else {
        // fallback try without region
        parsed = phoneUtil.parse(raw, 'IN');
      }

      if (phoneUtil.isValidNumber(parsed)) {
        e164 = phoneUtil.format(parsed, PNF.E164);
        country = phoneUtil.getRegionCodeForNumber(parsed) || null;
      }
    } catch (err) {
      // parsing failed — leave e164 null
      console.warn('parse failed for', raw, err && err.message);
    }

    if (!e164) {
      // nothing to update for normalized number
      continue;
    }

    try {
      await conn.execute(
        'UPDATE phone_numbers SET number_e164 = ?, country_code = ?, updated_at = NOW() WHERE id = ?',
        [e164, country, r.id]
      );
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        console.error('Duplicate normalized number detected for', e164, 'row id', r.id);
        conflicts.push({ id: r.id, customer_id: r.customer_id, raw: r.number_raw, e164, error: err.message });
      } else {
        console.error('Error updating', r.id, err && err.message);
      }
    }
  }

  await conn.end();

  if (conflicts.length) {
    const fs = require('fs');
    fs.writeFileSync(CONFLICTS_OUT, JSON.stringify(conflicts, null, 2));
    console.log('Conflicts written to', CONFLICTS_OUT);
  } else {
    console.log('Backfill complete, no conflicts.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
