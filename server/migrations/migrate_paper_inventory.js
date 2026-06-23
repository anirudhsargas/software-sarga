const { pool: defaultPool } = require('../database');

const PAPER_ALIASES = [
  'offset papers', 'laser papers', 'other papers',
  'offset paper', 'laser paper', 'other paper'
];

const isPaperCategory = (cat) => {
  if (!cat) return false;
  const c = String(cat).toLowerCase().trim();
  if (c.includes('paper')) return true;
  return PAPER_ALIASES.some(a => c.includes(a));
};

async function findPaperItems(pool) {
  // Find inventory items that look like paper items
  const sql = `SELECT * FROM sarga_inventory WHERE LOWER(COALESCE(category, '')) LIKE '%paper%' OR LOWER(COALESCE(category, '')) IN (${PAPER_ALIASES.map(() => '?').join(',')})`;
  const params = PAPER_ALIASES.map(a => a);
  const [rows] = await pool.query(sql, params);
  return rows || [];
}


async function migrate(poolOrOptions = {}) {
  const pool = poolOrOptions.pool || defaultPool;
  const deleteOriginals = !!poolOrOptions.deleteOriginals;

  const items = await findPaperItems(pool);
  if (!items || items.length === 0) {
    console.log('[migrate_paper_inventory] No paper-like inventory items found.');
    return { migrated: 0 };
  }



  let migratedCount = 0;

  for (const it of items) {
    try {
      const size = it.size_code || it.model_name || null;
      // Check if already migrated by SKU or (name+size)
      const [existing] = await pool.query(
        'SELECT id FROM sarga_paper_inventory WHERE sku = ? OR (name = ? AND COALESCE(size, '') = COALESCE(?, \'\')) LIMIT 1',
        [it.sku || null, it.name || null, size]
      );

      let paperId = null;
      if (existing && existing.length) {
        paperId = existing[0].id;
        // Update stock (packets_in_stock) by adding quantity
        await pool.query('UPDATE sarga_paper_inventory SET packets_in_stock = COALESCE(packets_in_stock,0) + ? WHERE id = ?', [Number(it.quantity) || 0, paperId]);
      } else {
        const [result] = await pool.query(
          `INSERT INTO sarga_paper_inventory (name, sku, gsm, size, finish, brand, sheets_per_packet, packets_in_stock, reorder_level_packets, cost_per_packet, sell_per_sheet, gst_rate, vendor_name, location, notes)
           VALUES (?, ?, NULL, ?, NULL, ?, 1, ?, ?, ?, ?, ?, NULL, ?)`,
          [it.name, it.sku || null, size, it.source_code || null, Number(it.quantity) || 0, Number(it.reorder_level) || 0, Number(it.cost_price) || 0, Number(it.sell_price) || 0, Number(it.gst_rate) || 0, it.vendor_name || null]
        );
        paperId = result.insertId;
      }

      if (paperId) {
        // Record mapping for traceability
        await pool.query('INSERT IGNORE INTO sarga_inventory_to_paper_inventory (inventory_item_id, paper_item_id) VALUES (?, ?)', [it.id, paperId]);
        migratedCount += 1;
      }

      if (deleteOriginals) {
        try {
          await pool.query('DELETE FROM sarga_inventory WHERE id = ?', [it.id]);
        } catch (e) {
          console.warn('[migrate_paper_inventory] Failed to delete original inventory id=', it.id, e.message || e);
        }
      }
    } catch (err) {
      console.error('[migrate_paper_inventory] Error migrating item id=', it.id, err.message || err);
    }
  }

  console.log(`[migrate_paper_inventory] Migration complete. Migrated ${migratedCount} item(s).`);
  return { migrated: migratedCount };
}

if (require.main === module) {
  (async () => {
    try {
      const deleteOriginals = process.argv.includes('--delete-originals');
      await migrate({ pool: defaultPool, deleteOriginals });
      process.exit(0);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      process.exit(1);
    }
  })();
}

module.exports = { migrate, findPaperItems, ensureMappingTable };
