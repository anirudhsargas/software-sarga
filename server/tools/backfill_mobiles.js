#!/usr/bin/env node
// Backfill script: populate `mobile_normalized` on sarga_customers and insert into phone_numbers
// Run: node server/tools/backfill_mobiles.js

const { pool } = require('../database');
const { normalizeMobileWithCountry } = require('../helpers');

async function backfill() {
  console.log('Starting backfill of customer mobiles...');
  try {
    const [rows] = await pool.query('SELECT id, mobile FROM sarga_customers');
    console.log(`Found ${rows.length} customers`);
    for (const r of rows) {
      const norm = normalizeMobileWithCountry(r.mobile);
      try {
        await pool.query('UPDATE sarga_customers SET mobile_normalized = ? WHERE id = ?', [norm || null, r.id]);
      } catch (uerr) {
        console.warn('Failed updating customer', r.id, uerr && uerr.message);
      }

      if (norm) {
        try {
          const [exists] = await pool.query('SELECT id FROM phone_numbers WHERE number_e164 = ? LIMIT 1', [norm]);
          if (!exists || !exists.length) {
            await pool.query('INSERT INTO phone_numbers (customer_id, number_e164, is_primary) VALUES (?, ?, 1)', [r.id, norm]);
          }
        } catch (perr) {
          console.warn('Failed inserting phone_numbers for', r.id, perr && perr.message);
        }
      }
    }
    console.log('Backfill complete');
  } catch (err) {
    console.error('Backfill failed:', err && err.message);
    process.exit(2);
  } finally {
    process.exit(0);
  }
}

backfill();
