const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../helpers');
const { invalidateHierarchyCache } = require('./jobs');
const { validate, officeExpenseSchema } = require('../middleware/validate');
const { paginate } = require('../helpers/pagination');
const { uploadToCloudinary } = require('../helpers/cloudinaryUpload');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  }
});

const allowedDocExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xls', '.xlsx', '.doc', '.docx']);
const documentFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedDocExts.has(ext)) return cb(null, true);
  return cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, PDF, XLS, XLSX, DOC, DOCX.'));
};

const uploadDocs = multer({ storage: documentStorage, fileFilter: documentFileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const BILL_DOC_TYPES = new Set([
  'Vendor Bill',
  'Utility Bill',
  'Rent Receipt',
  'EMI Receipt',
  'Kuri Receipt',
  'Transport Bill',
  'Office Bill',
  'Petty Cash Receipt',
  'Other'
]);

function normalizeBillDocumentType(input, relatedTab = '') {
  const raw = String(input || '').trim();
  const tab = String(relatedTab || '').toLowerCase();

  const directMap = {
    'invoice': 'Vendor Bill',
    'sales order': 'Vendor Bill',
    'bill': 'Vendor Bill',
    'vendor bill': 'Vendor Bill',
    'utility': 'Utility Bill',
    'utility bill': 'Utility Bill',
    'rent': 'Rent Receipt',
    'rent receipt': 'Rent Receipt',
    'emi': 'EMI Receipt',
    'emi receipt': 'EMI Receipt',
    'kuri': 'Kuri Receipt',
    'kuri receipt': 'Kuri Receipt',
    'transport': 'Transport Bill',
    'transport bill': 'Transport Bill',
    'office': 'Office Bill',
    'office bill': 'Office Bill',
    'petty cash': 'Petty Cash Receipt',
    'petty cash receipt': 'Petty Cash Receipt',
    'receipt': 'Other',
    'other': 'Other'
  };

  const key = raw.toLowerCase();
  if (directMap[key]) return directMap[key];
  if (BILL_DOC_TYPES.has(raw)) return raw;

  if (tab === 'vendors' || tab === 'vendor') return 'Vendor Bill';
  if (tab === 'utilities' || tab === 'utility') return 'Utility Bill';
  if (tab === 'rent') return 'Rent Receipt';
  if (tab === 'transport') return 'Transport Bill';
  if (tab === 'office') return 'Office Bill';
  if (tab === 'petty-cash' || tab === 'petty_cash') return 'Petty Cash Receipt';

  return 'Other';
}

function mapVendorTypeFromDocumentType(documentType = '') {
  const dt = String(documentType || '').trim();
  if (dt === 'Vendor Bill') return 'Vendor';
  if (dt === 'Utility Bill') return 'Utility';
  if (dt === 'Rent Receipt') return 'Rent';
  return 'Other';
}

function normalizeVendorName(name = '') {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function stripFiscalSuffix(name = '') {
  return normalizeVendorName(name).replace(/\s*-\s*\(\d{4}\s*[-/]\s*\d{4}\)\s*$/i, '').trim();
}

function vendorMatchKey(name = '') {
  return stripFiscalSuffix(name).toLowerCase();
}

async function ensureVendorExistsFromBill({ vendorName, documentType, branchId }) {
  const rawName = normalizeVendorName(vendorName);
  if (!rawName) return null;

  const canonicalName = stripFiscalSuffix(rawName) || rawName;
  const targetKey = vendorMatchKey(canonicalName);

  const [rows] = await pool.query(
    `SELECT id, name
     FROM vendors
     WHERE is_active = TRUE AND LOWER(TRIM(name)) IN (?, ?)
     LIMIT 100`,
    [rawName.toLowerCase(), canonicalName.toLowerCase()]
  );

  const existing = rows.find((row) => vendorMatchKey(row.name) === targetKey) || rows[0];
  if (existing?.id) return existing.id;

  const vendorType = mapVendorTypeFromDocumentType(documentType);
  const [insertRes] = await pool.query(
    'INSERT INTO vendors (name, vendor_type, branch_id, category) VALUES (?, ?, ?, ?)',
    [canonicalName, vendorType, branchId || null, 'other']
  );

  try {
    await pool.query(
      'INSERT IGNORE INTO sarga_vendors (name, type, branch_id) VALUES (?, ?, ?)',
      [canonicalName, vendorType, branchId || null]
    );
  } catch (_ignored) { /* ignored */ }

  return insertRes.insertId;
}

function normalizeLineItemsInput(lineItemsRaw) {
  if (!lineItemsRaw) return [];

  let parsed = lineItemsRaw;
  if (typeof lineItemsRaw === 'string') {
    try {
      parsed = JSON.parse(lineItemsRaw);
    } catch (_error) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      const itemName = String(item?.item_name || item?.name || item?.description || '').trim();
      const qtyRaw = Number(item?.quantity ?? item?.qty ?? 0) || 0;
      const rateRaw = Number(item?.rate ?? item?.unit_price ?? 0) || 0;
      const totalRaw = Number(item?.total_amount ?? item?.amount ?? item?.mrp ?? 0) || 0;

      const quantity = qtyRaw > 0
        ? qtyRaw
        : (totalRaw > 0 || rateRaw > 0 ? 1 : 0);

      const rate = rateRaw > 0
        ? rateRaw
        : (totalRaw > 0 && quantity > 0 ? totalRaw / quantity : 0);

      const totalAmount = totalRaw > 0
        ? totalRaw
        : (quantity > 0 && rate > 0 ? quantity * rate : 0);

      const explicitSellRaw = item?.sell_price ?? item?.selling_price ?? '';
      const explicitSell = explicitSellRaw === '' || explicitSellRaw === null || explicitSellRaw === undefined
        ? 0
        : (Number(explicitSellRaw) || 0);

      return {
        item_name: itemName,
        quantity,
        unit: String(item?.unit || 'pcs').trim() || 'pcs',
        rate,
        hsn_sac: String(item?.hsn_sac || item?.hsn || '').trim() || null,
        gst_percent: Number(item?.gst_percent ?? item?.gst_rate ?? 0) || 0,
        total_amount: totalAmount,
        category_name: String(item?.category_name || item?.category || '').trim() || null,
        subcategory_name: String(item?.subcategory_name || item?.subcategory || '').trim() || null,
        subcategory_id: item?.subcategory_id ? Number(item.subcategory_id) : null,
        // Use only explicit sell price from pricing step; do not silently fall back to MRP.
        sell_price: explicitSell,
        custom_sku: String(item?.sku || item?.custom_sku || '').trim() || null,
        skip_product_library: Boolean(item?.skip_product_library)
      };
    })
    .filter((item) => item.item_name && (item.quantity > 0 || item.total_amount > 0 || item.rate > 0));
}

async function syncLineItemsToInventory({ lineItems, vendorName }) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return;

  const upsertedInventoryItems = [];

  const toCode = (value = '', maxLen = 30) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, maxLen);

  const extractSizeCode = (itemName = '') => {
    const raw = String(itemName || '').toUpperCase();
    const dimMatch = raw.match(/\b\d{1,3}\s*[Xx]\s*\d{1,3}(?:\s*[Xx]\s*\d{1,3})?\b/);
    if (dimMatch?.[0]) return dimMatch[0].replace(/\s+/g, '').replace(/X/g, 'X');

    const unitMatch = raw.match(/\b\d+(?:\.\d+)?\s*(MM|CM|IN|FT)\b/);
    if (unitMatch?.[0]) return unitMatch[0].replace(/\s+/g, '');

    const alphaSizeMatch = raw.match(/\b(XXXL|XXL|2XL|XL|L|M|S|XS)\b/);
    if (alphaSizeMatch?.[1]) return alphaSizeMatch[1].replace('2XL', 'XXL');

    return 'M';
  };

  const buildSkuBase = ({ vendor, category, itemName, sizeCode }) => {
    const vendorCode = toCode(String(vendor || '').split(/\s+/).slice(0, 2).join(''), 3)
      || toCode(category || 'INV', 3)
      || 'INV';
    const modelCode = toCode(itemName || 'ITEM', 24) || 'ITEM';
    const size = toCode(sizeCode || 'M', 10) || 'M';
    return `${vendorCode}-${modelCode}-${size}`;
  };

  const ensureUniqueSku = async (baseSku, inventoryId = null) => {
    const normalizedBase = String(baseSku || '').trim();
    if (!normalizedBase) return null;

    const [rows] = await pool.query(
      `SELECT id FROM sarga_inventory
       WHERE UPPER(REPLACE(COALESCE(sku, ''), ' ', '')) = UPPER(REPLACE(?, ' ', ''))
         AND (? IS NULL OR id <> ?)
       LIMIT 1`,
      [normalizedBase, inventoryId, inventoryId]
    );

    if (!rows.length) return normalizedBase;
    const suffix = inventoryId ? `-${inventoryId}` : `-${Date.now().toString().slice(-4)}`;
    const trimmed = normalizedBase.slice(0, Math.max(10, 80 - suffix.length));
    return `${trimmed}${suffix}`;
  };

  const inferInventoryCategory = (itemName, hsn) => {
    const name = String(itemName || '').toLowerCase();
    const hsnCode = String(hsn || '').replace(/\D/g, '');
    const vendor = String(vendorName || '').toLowerCase();

    if (/memento|troph|award|shield|plaque|souvenir/.test(vendor)) {
      return 'Memento';
    }

    if (/paper|board|sheet|card|sticker|label/.test(name) || hsnCode.startsWith('48') || hsnCode.startsWith('49')) {
      return 'Paper & Print';
    }
    if (/ink|toner|cartridge|ribbon/.test(name)) {
      return 'Printing Consumables';
    }
    if (/wire|cable|switch|adapter|motor|machine|tool/.test(name) || hsnCode.startsWith('84') || hsnCode.startsWith('85')) {
      return 'Machine & Electrical';
    }
    if (/tape|glue|adhesive|lamination|pouch|packing|box/.test(name) || hsnCode.startsWith('39')) {
      return 'Packaging';
    }
    return 'Bill Products';
  };

  // --- BATCH PRE-FETCH EXISTING INVENTORY ITEMS ---
  const itemNames = lineItems.map(item => item.item_name).filter(Boolean);
  const lowerNames = itemNames.map(name => String(name).toLowerCase());
  const existingMap = new Map();

  if (lowerNames.length > 0) {
    const [existingRows] = await pool.query(
      `SELECT id, name, hsn, quantity, cost_price, vendor_name, sku
       FROM sarga_inventory
       WHERE LOWER(name) IN (?)
         AND LOWER(COALESCE(vendor_name, '')) = LOWER(COALESCE(?, ''))`,
      [lowerNames, vendorName || '']
    );
    for (const row of existingRows) {
      const key = String(row.name).toLowerCase();
      if (!existingMap.has(key)) {
        existingMap.set(key, []);
      }
      existingMap.get(key).push(row);
    }
  }
  // ------------------------------------------------

  for (const item of lineItems) {
    const {
      item_name,
      quantity,
      unit,
      rate,
      hsn_sac,
      gst_percent,
      total_amount,
      category_name,
      subcategory_name,
      subcategory_id,
      sell_price,
      custom_sku,
      skip_product_library
    } = item;

    const derivedRate = Number(rate) > 0
      ? Number(rate)
      : (Number(total_amount) > 0 && Number(quantity) > 0 ? Number(total_amount) / Number(quantity) : 0);
    const manualCategory = String(subcategory_name || category_name || '').trim();
    const inferredCategory = manualCategory || inferInventoryCategory(item_name, hsn_sac);

    const sizeCode = extractSizeCode(item_name);
    const sourceCode = toCode(String(vendorName || '').split(/\s+/).slice(0, 2).join(''), 3)
      || toCode(inferredCategory || 'INV', 3)
      || 'INV';
    const modelName = String(item_name || '').trim().slice(0, 100);

    // Match on name + same vendor from the pre-fetched Map
    const potentials = existingMap.get(String(item_name).toLowerCase()) || [];
    const existing = potentials.find(r => r.hsn === hsn_sac || (!hsn_sac && !r.hsn));

    if (existing?.id) {
      const baseSku = buildSkuBase({ vendor: vendorName, category: inferredCategory, itemName: item_name, sizeCode });
      const nextSku = await ensureUniqueSku(baseSku, existing.id);

      await pool.query(
        `UPDATE sarga_inventory
         SET category = COALESCE(category, ?),
             unit = COALESCE(?, unit),
             hsn = COALESCE(?, hsn),
             gst_rate = CASE WHEN ? > 0 THEN ? ELSE gst_rate END,
             cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
             sell_price = CASE WHEN ? > 0 THEN ? ELSE sell_price END,
             vendor_name = COALESCE(?, vendor_name),
             source_code = COALESCE(source_code, ?),
             model_name = COALESCE(model_name, ?),
             size_code = COALESCE(size_code, ?),
             sku = CASE
               WHEN ? IS NOT NULL AND ? <> '' THEN ?
               WHEN sku IS NULL OR sku = '' THEN ?
               ELSE sku
             END
         WHERE id = ?`,
        [
          inferredCategory,
          unit || null,
          hsn_sac,
          Number(gst_percent) || 0,
          Number(gst_percent) || 0,
          derivedRate,
          derivedRate,
          Number(sell_price) || 0,
          Number(sell_price) || 0,
          vendorName || null,
          sourceCode,
          modelName,
          sizeCode,
          custom_sku || null,
          custom_sku || null,
          custom_sku || null,
          custom_sku || existing.sku || nextSku,
          existing.id
        ]
      );
      upsertedInventoryItems.push({
        inventoryId: existing.id,
        name: item_name,
        category: inferredCategory,
        sellPrice: derivedRate,
        userSellPrice: Number(sell_price) || 0,
        customSku: custom_sku || null,
        skipProductLibrary: Boolean(skip_product_library),
        categoryName: category_name || null,
        subcategoryName: subcategory_name || null,
        subcategoryId: subcategory_id || null
      });
      continue;
    }

    const [insertRes] = await pool.query(
      `INSERT INTO sarga_inventory
       (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, discount, gst_rate, source_code, model_name, size_code, item_type, vendor_name)
       VALUES (?, ?, NULL, ?, 0, 0, ?, ?, ?, 0, ?, ?, ?, ?, 'Retail', ?)`,
      [
        item_name,
        custom_sku || null,
        unit || 'pcs',
        derivedRate,
        Number(sell_price) || 0,
        hsn_sac,
        Number(gst_percent) || 0,
        sourceCode,
        modelName,
        sizeCode,
        vendorName || null
      ]
    );

    const inventoryId = insertRes.insertId;
    upsertedInventoryItems.push({
      inventoryId,
      name: item_name,
      category: inferredCategory,
      sellPrice: derivedRate,
      userSellPrice: Number(sell_price) || 0,
      customSku: custom_sku || null,
      skipProductLibrary: Boolean(skip_product_library),
      categoryName: category_name || null,
      subcategoryName: subcategory_name || null,
      subcategoryId: subcategory_id || null
    });

    await pool.query(
      `UPDATE sarga_inventory SET category = ? WHERE id = ? AND (category IS NULL OR category = '')`,

      [inferredCategory, inventoryId]
    );

    // Only auto-generate SKU if the user didn't provide a custom one
    if (!custom_sku) {
      const baseSku = buildSkuBase({ vendor: vendorName, category: inferredCategory, itemName: item_name, sizeCode });
      const nextSku = await ensureUniqueSku(baseSku, inventoryId);
      if (nextSku) {
        await pool.query(
          `UPDATE sarga_inventory SET sku = ? WHERE id = ? AND (sku IS NULL OR sku = '')`,
          [nextSku, inventoryId]
        );
      }
    }
  }

  return upsertedInventoryItems;
}

async function ensureAutoImportSubcategory(preferredSubcategoryName = 'Bill Products') {
  const [existing] = await pool.query(
    `SELECT s.id
     FROM sarga_product_subcategories s
     INNER JOIN sarga_product_categories c ON c.id = s.category_id
     WHERE LOWER(s.name) = LOWER(?)
     LIMIT 1`,
    [preferredSubcategoryName]
  );
  if (existing.length > 0) return existing[0].id;

  const [catRows] = await pool.query(
    'SELECT id FROM sarga_product_categories WHERE LOWER(name) = LOWER(?) LIMIT 1',
    ['Auto Imported']
  );

  let categoryId = catRows[0]?.id;
  if (!categoryId) {
    const [[posRow]] = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_categories');
    const [catIns] = await pool.query(
      'INSERT INTO sarga_product_categories (name, position) VALUES (?, ?)',
      ['Auto Imported', posRow?.nextPos || 1]
    );
    categoryId = catIns.insertId;
  }

  const [[subPos]] = await pool.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_product_subcategories WHERE category_id = ?',
    [categoryId]
  );

  const [subIns] = await pool.query(
    'INSERT INTO sarga_product_subcategories (category_id, name, position) VALUES (?, ?, ?)',
    [categoryId, preferredSubcategoryName, subPos?.nextPos || 1]
  );
  return subIns.insertId;
}

async function findBestSubcategoryId(inventoryCategory = '') {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const normalizedCategory = normalize(inventoryCategory);
  if (!normalizedCategory) {
    return ensureAutoImportSubcategory('Bill Products');
  }

  const [allSubcats] = await pool.query(
    `SELECT s.id as sub_id, s.name as sub_name, c.name as cat_name
     FROM sarga_product_subcategories s
     INNER JOIN sarga_product_categories c ON c.id = s.category_id
     ORDER BY s.name`
  );

  for (const row of allSubcats) {
    if (normalize(row.sub_name) === normalizedCategory) return row.sub_id;
  }

  for (const row of allSubcats) {
    const subName = normalize(row.sub_name);
    if (normalizedCategory.includes(subName) || subName.includes(normalizedCategory)) return row.sub_id;
  }

  for (const row of allSubcats) {
    const catName = normalize(row.cat_name);
    if (normalizedCategory.includes(catName) || catName.includes(normalizedCategory)) return row.sub_id;
  }

  return ensureAutoImportSubcategory(inventoryCategory);
}

async function ensureProductLibraryFromInventoryItem({ inventoryId, name, category, costPrice, userSellPrice, customSku, subcategoryId }) {
  if (!inventoryId) return;

  // Fetch inventory metadata to derive company_name, company_code, size
  const [[invMeta]] = await pool.query(
    'SELECT vendor_name, source_code, size_code, sku FROM sarga_inventory WHERE id = ? LIMIT 1',
    [inventoryId]
  );
  const effectiveSku = customSku || invMeta?.sku || '';
  const skuParts = effectiveSku.split('-').map(p => String(p || '').trim()).filter(Boolean);
  const derivedCompanyCode = skuParts[0] || String(invMeta?.source_code || '').toUpperCase();
  const derivedCompanyName = String(invMeta?.vendor_name || '').trim();
  const derivedSize = String(invMeta?.size_code || '').trim();

  const [alreadyLinked] = await pool.query(
    'SELECT id FROM sarga_products WHERE inventory_item_id = ? LIMIT 1',
    [inventoryId]
  );

  // Use the directly-provided subcategory ID if available, otherwise fall back to name-based lookup
  const resolvedSubcategoryId = subcategoryId
    ? subcategoryId
    : await findBestSubcategoryId(category);
  const [[positionRow]] = await pool.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM sarga_products WHERE subcategory_id = ?',
    [resolvedSubcategoryId]
  );

  // costPrice is the vendor purchase price — store it in the description for reference.
  // For MEMENTO category: selling price = 2× cost (standard doubling rule).
  // For all other categories: selling price is left at 0 — user must set it manually.
  const [[subcatRow]] = await pool.query(
    `SELECT sc.name AS subcatName, pc.name AS catName
     FROM sarga_product_subcategories sc
     JOIN sarga_product_categories pc ON pc.id = sc.category_id
     WHERE sc.id = ?`,
    [resolvedSubcategoryId]
  );
  const parentCategoryName = (subcatRow?.catName || '').toLowerCase();
  const isMemento = parentCategoryName.includes('memento');

  const cost = Number(costPrice) || 0;
  const userSell = Number(userSellPrice) || 0;
  // Priority: 1) User-entered sell price, 2) 2× cost for Memento, 3) 0 (needs manual entry)
  const sellRate = userSell > 0 ? userSell : (isMemento && cost > 0 ? cost * 2 : 0);

  const costNote = cost > 0 ? ` Cost: ₹${cost.toFixed(2)}.` : '';
  const priceNote = sellRate > 0
    ? ` Sell: ₹${sellRate.toFixed(2)}${userSell > 0 ? '' : ' (2× cost)'}.`
    : ' Set selling price before use.';

  if (alreadyLinked.length > 0) {
    const existingProductId = alreadyLinked[0].id;

    // Preserve existing product_code/company_code (immutable after creation)
    await pool.query(
      `UPDATE sarga_products
       SET product_code = COALESCE(NULLIF(?, ''), product_code),
           company_name = COALESCE(NULLIF(?, ''), company_name),
           company_code = COALESCE(NULLIF(?, ''), company_code),
           size = COALESCE(NULLIF(?, ''), size)
       WHERE id = ?`,
      [customSku || null, derivedCompanyName || null, derivedCompanyCode || null, derivedSize || null, existingProductId]
    );

    if (sellRate > 0) {
      const [slabs] = await pool.query(
        'SELECT id FROM sarga_product_slabs WHERE product_id = ? ORDER BY id ASC LIMIT 1',
        [existingProductId]
      );
      if (slabs.length > 0) {
        await pool.query(
          'UPDATE sarga_product_slabs SET base_value = ?, unit_rate = ? WHERE id = ?',
          [sellRate, sellRate, slabs[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate) VALUES (?, 1, NULL, ?, ?)',
          [existingProductId, sellRate, sellRate]
        );
      }
    }

    await pool.query(
      'UPDATE sarga_products SET description = ? WHERE id = ?',
      [`Auto-created from bill upload.${costNote}${priceNote}`, existingProductId]
    );

    return;
  }

  const [productIns] = await pool.query(
    `INSERT INTO sarga_products
     (subcategory_id, name, product_code, company_name, company_code, size, calculation_type, description, has_paper_rate, paper_rate, has_double_side_rate, position, inventory_item_id, is_physical_product)
     VALUES (?, ?, ?, ?, ?, ?, 'Normal', ?, 0, 0, 0, ?, ?, 1)`,
    [
      resolvedSubcategoryId,
      String(name || '').trim() || `Inventory Item ${inventoryId}`,
      customSku || null,
      derivedCompanyName || null,
      derivedCompanyCode || null,
      derivedSize || null,
      `Auto-created from bill upload.${costNote}${priceNote}`,
      positionRow?.nextPos || 1,
      inventoryId
    ]
  );

  await pool.query(
    'INSERT INTO sarga_product_slabs (product_id, min_qty, max_qty, base_value, unit_rate) VALUES (?, 1, NULL, ?, ?)',
    [productIns.insertId, sellRate, sellRate]
  );
}

// ========== OFFICE & ADMIN EXPENSES ==========

// Get office expenses dashboard
router.get('/office-dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;

    // Build branch filter
    const branchFilter = ['Admin', 'Accountant'].includes(role) ? '' : 'WHERE o.branch_id = ?';
    const branchParams = ['Admin', 'Accountant'].includes(role) ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Count of transactions this month
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Breakdown by expense type
    const [breakdownRows] = await pool.query(
      `SELECT expense_type, SUM(amount) as total
       FROM sarga_office_expenses o
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY expense_type
       ORDER BY total DESC`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT o.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_office_expenses o
       LEFT JOIN sarga_staff s ON o.created_by = s.id
       LEFT JOIN sarga_branches b ON o.branch_id = b.id
       ${branchFilter}
       ORDER BY o.expense_date DESC, o.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      breakdown: breakdownRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Office dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all office expenses with filters
router.get('/office-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { expense_type, start_date, end_date } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (!['Admin', 'Accountant'].includes(role)) {
      whereClauses.push('o.branch_id = ?');
      params.push(branch_id);
    }

    if (expense_type) {
      whereClauses.push('o.expense_type = ?');
      params.push(expense_type);
    }

    if (start_date) {
      whereClauses.push('o.expense_date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('o.expense_date <= ?');
      params.push(end_date);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_office_expenses o
      LEFT JOIN sarga_staff s ON o.created_by = s.id
      LEFT JOIN sarga_branches b ON o.branch_id = b.id
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT o.*, s.name as created_by_name, b.name as branch_name
      ${baseFrom}
      ORDER BY o.expense_date DESC, o.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (error) {
    console.error('Get office expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add office expense
router.post('/office-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(officeExpenseSchema), async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const { expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_office_expenses 
       (branch_id, expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, created_by]
    );

    // SYNC WITH GLOBAL PAYMENTS TABLE
    await pool.query(`
      INSERT INTO sarga_payments 
      (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
      VALUES (?, 'Other', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      branch_id,
      vendor_name || 'Office Expense',
      amount,
      payment_method || 'Cash',
      payment_method === 'UPI' ? 0 : amount,
      payment_method === 'UPI' ? amount : 0,
      reference_number,
      `Office Expense: ${expense_type}${description ? ' - ' + description : ''}`,
      expense_date || new Date()
    ]);

    auditLog(req.user.id, 'OFFICE_EXPENSE_ADD', `Added office expense: ${expense_type} ₹${amount}`, { entity_type: 'office_expense', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId });

    // Trigger anomaly check asynchronously (non-blocking)
    try { require('./anomalies').checkAnomalies().catch(() => {}); } catch (_ignored) { /* ignored */ }
  } catch (error) {
    console.error('Add office expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update office expense
router.put('/office-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), validate(officeExpenseSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number } = req.body;

    const [[expense]] = await pool.query('SELECT branch_id FROM sarga_office_expenses WHERE id = ?', [id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'Admin' && Number(expense.branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ error: 'Access denied: expense belongs to a different branch.' });
    }

    await pool.query(
      `UPDATE sarga_office_expenses 
       SET expense_type=?, vendor_name=?, amount=?, payment_method=?, reference_number=?, description=?, expense_date=?, bill_number=?
       WHERE id=?`,
      [expense_type, vendor_name, amount, payment_method, reference_number, description, expense_date, bill_number, id]
    );

    auditLog(req.user.id, 'OFFICE_EXPENSE_UPDATE', `Updated office expense #${id}: ${expense_type} ₹${amount}`, { entity_type: 'office_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Update office expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete office expense
router.delete('/office-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can delete expenses' });
    }

    const { id } = req.params;
    const [[expense]] = await pool.query('SELECT branch_id FROM sarga_office_expenses WHERE id = ?', [id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'Admin' && Number(expense.branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ error: 'Access denied: expense belongs to a different branch.' });
    }

    await pool.query('DELETE FROM sarga_office_expenses WHERE id = ?', [id]);
    auditLog(req.user.id, 'OFFICE_EXPENSE_DELETE', `Deleted office expense #${id}`, { entity_type: 'office_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete office expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== TRANSPORT & DELIVERY EXPENSES ==========

// Get transport dashboard
router.get('/transport-dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;

    const branchFilter = ['Admin', 'Accountant'].includes(role) ? '' : 'WHERE t.branch_id = ?';
    const branchParams = ['Admin', 'Accountant'].includes(role) ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Breakdown by transport type
    const [breakdownRows] = await pool.query(
      `SELECT transport_type, SUM(amount) as total, COUNT(*) as count
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY transport_type
       ORDER BY total DESC`,
      branchParams
    );

    // Total distance this month
    const [distanceRows] = await pool.query(
      `SELECT COALESCE(SUM(distance_km), 0) as total_km
       FROM sarga_transport_expenses t
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT t.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_transport_expenses t
       LEFT JOIN sarga_staff s ON t.created_by = s.id
       LEFT JOIN sarga_branches b ON t.branch_id = b.id
       ${branchFilter}
       ORDER BY t.expense_date DESC, t.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      total_distance_km: distanceRows[0].total_km,
      breakdown: breakdownRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Transport dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all transport expenses with filters
router.get('/transport-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { transport_type, start_date, end_date } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (!['Admin', 'Accountant'].includes(role)) {
      whereClauses.push('t.branch_id = ?');
      params.push(branch_id);
    }

    if (transport_type) {
      whereClauses.push('t.transport_type = ?');
      params.push(transport_type);
    }

    if (start_date) {
      whereClauses.push('t.expense_date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('t.expense_date <= ?');
      params.push(end_date);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_transport_expenses t
      LEFT JOIN sarga_staff s ON t.created_by = s.id
      LEFT JOIN sarga_branches b ON t.branch_id = b.id
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT t.*, s.name as created_by_name, b.name as branch_name
      ${baseFrom}
      ORDER BY t.expense_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (error) {
    console.error('Get transport expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add transport expense
router.post('/transport-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const {
      transport_type, vehicle_number, driver_name, amount, payment_method,
      reference_number, description, expense_date, bill_number,
      from_location, to_location, distance_km
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_transport_expenses 
       (branch_id, transport_type, vehicle_number, driver_name, amount, payment_method, reference_number, 
        description, expense_date, bill_number, from_location, to_location, distance_km, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, transport_type, vehicle_number, driver_name, amount, payment_method, reference_number,
        description, expense_date, bill_number, from_location, to_location, distance_km, created_by]
    );

    // SYNC WITH GLOBAL PAYMENTS TABLE
    await pool.query(`
      INSERT INTO sarga_payments 
      (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
      VALUES (?, 'Other', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      branch_id,
      driver_name || 'Transport Expense',
      amount,
      payment_method || 'Cash',
      payment_method === 'UPI' ? 0 : amount,
      payment_method === 'UPI' ? amount : 0,
      reference_number,
      `Transport Expense: ${transport_type}${description ? ' - ' + description : ''}`,
      expense_date || new Date()
    ]);

    auditLog(req.user.id, 'TRANSPORT_EXPENSE_ADD', `Added transport expense: ${transport_type} ₹${amount}`, { entity_type: 'transport_expense', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add transport expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transport expense
router.put('/transport-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transport_type, vehicle_number, driver_name, amount, payment_method,
      reference_number, description, expense_date, bill_number,
      from_location, to_location, distance_km
    } = req.body;

    const [[expense]] = await pool.query('SELECT branch_id FROM sarga_transport_expenses WHERE id = ?', [id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'Admin' && Number(expense.branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ error: 'Access denied: expense belongs to a different branch.' });
    }

    await pool.query(
      `UPDATE sarga_transport_expenses 
       SET transport_type=?, vehicle_number=?, driver_name=?, amount=?, payment_method=?, reference_number=?, 
           description=?, expense_date=?, bill_number=?, from_location=?, to_location=?, distance_km=?
       WHERE id=?`,
      [transport_type, vehicle_number, driver_name, amount, payment_method, reference_number,
        description, expense_date, bill_number, from_location, to_location, distance_km, id]
    );

    auditLog(req.user.id, 'TRANSPORT_EXPENSE_UPDATE', `Updated transport expense #${id}: ₹${amount}`, { entity_type: 'transport_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Update transport expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete transport expense
router.delete('/transport-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can delete expenses' });
    }

    const { id } = req.params;
    const [[expense]] = await pool.query('SELECT branch_id FROM sarga_transport_expenses WHERE id = ?', [id]);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.user.role !== 'Admin' && Number(expense.branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ error: 'Access denied: expense belongs to a different branch.' });
    }

    await pool.query('DELETE FROM sarga_transport_expenses WHERE id = ?', [id]);
    auditLog(req.user.id, 'TRANSPORT_EXPENSE_DELETE', `Deleted transport expense #${id}`, { entity_type: 'transport_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete transport expense error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== MISCELLANEOUS EXPENSES ==========

// Get miscellaneous dashboard
router.get('/misc-dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;

    const branchFilter = ['Admin', 'Accountant'].includes(role) ? '' : 'WHERE m.branch_id = ?';
    const branchParams = ['Admin', 'Accountant'].includes(role) ? [] : [branch_id];

    // Total spent this month
    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'} 
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Top categories
    const [categoriesRows] = await pool.query(
      `SELECT expense_category, SUM(amount) as total, COUNT(*) as count
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       GROUP BY expense_category
       ORDER BY total DESC
       LIMIT 10`,
      branchParams
    );

    // Recurring expenses
    const [recurringRows] = await pool.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM sarga_misc_expenses m
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       is_recurring = 1 AND
       DATE_FORMAT(expense_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent expenses
    const [recentRows] = await pool.query(
      `SELECT m.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_misc_expenses m
       LEFT JOIN sarga_staff s ON m.created_by = s.id
       LEFT JOIN sarga_branches b ON m.branch_id = b.id
       ${branchFilter}
       ORDER BY m.expense_date DESC, m.created_at DESC
       LIMIT 20`,
      branchParams
    );

    res.json({
      total_spent: totalRows[0].total,
      transaction_count: countRows[0].count,
      recurring_count: recurringRows[0].count,
      recurring_total: recurringRows[0].total,
      top_categories: categoriesRows,
      recent_expenses: recentRows
    });
  } catch (error) {
    console.error('Misc dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all miscellaneous expenses with filters
router.get('/misc-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { expense_category, start_date, end_date } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (!['Admin', 'Accountant'].includes(role)) {
      whereClauses.push('m.branch_id = ?');
      params.push(branch_id);
    }

    if (expense_category) {
      whereClauses.push('m.expense_category = ?');
      params.push(expense_category);
    }

    if (start_date) {
      whereClauses.push('m.expense_date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('m.expense_date <= ?');
      params.push(end_date);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_misc_expenses m
      LEFT JOIN sarga_staff s ON m.created_by = s.id
      LEFT JOIN sarga_branches b ON m.branch_id = b.id
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT m.*, s.name as created_by_name, b.name as branch_name
      ${baseFrom}
      ORDER BY m.expense_date DESC, m.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (error) {
    console.error('Get misc expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add miscellaneous expense
router.post('/misc-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, id: created_by } = req.user;
    const {
      expense_category, vendor_name, amount, payment_method, reference_number,
      description, expense_date, bill_number, is_recurring
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO sarga_misc_expenses 
       (branch_id, expense_category, vendor_name, amount, payment_method, reference_number, 
        description, expense_date, bill_number, is_recurring, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, expense_category, vendor_name, amount, payment_method, reference_number,
        description, expense_date, bill_number, is_recurring ? 1 : 0, created_by]
    );

    // SYNC WITH GLOBAL PAYMENTS TABLE
    await pool.query(`
      INSERT INTO sarga_payments 
      (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
      VALUES (?, 'Other', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      branch_id,
      vendor_name || 'Misc Expense',
      amount,
      payment_method || 'Cash',
      payment_method === 'UPI' ? 0 : amount,
      payment_method === 'UPI' ? amount : 0,
      reference_number,
      `Misc Expense: ${expense_category}${description ? ' - ' + description : ''}`,
      expense_date || new Date()
    ]);

    auditLog(req.user.id, 'MISC_EXPENSE_ADD', `Added misc expense: ${expense_category} ₹${amount}`, { entity_type: 'misc_expense', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update miscellaneous expense
router.put('/misc-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      expense_category, vendor_name, amount, payment_method, reference_number,
      description, expense_date, bill_number, is_recurring
    } = req.body;

    await pool.query(
      `UPDATE sarga_misc_expenses 
       SET expense_category=?, vendor_name=?, amount=?, payment_method=?, reference_number=?, 
           description=?, expense_date=?, bill_number=?, is_recurring=?
       WHERE id=?`,
      [expense_category, vendor_name, amount, payment_method, reference_number,
        description, expense_date, bill_number, is_recurring ? 1 : 0, id]
    );

    auditLog(req.user.id, 'MISC_EXPENSE_UPDATE', `Updated misc expense #${id}: ${expense_category} ₹${amount}`, { entity_type: 'misc_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Update misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete miscellaneous expense
router.delete('/misc-expenses/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins/accountants can delete expenses' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM sarga_misc_expenses WHERE id = ?', [id]);
    auditLog(req.user.id, 'MISC_EXPENSE_DELETE', `Deleted misc expense #${id}`, { entity_type: 'misc_expense', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete misc expense error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== PETTY CASH MANAGEMENT ==========

// Get petty cash dashboard
router.get('/petty-cash-dashboard', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;

    const branchFilter = ['Admin', 'Accountant'].includes(role) ? '' : 'WHERE p.branch_id = ?';
    const branchParams = ['Admin', 'Accountant'].includes(role) ? [] : [branch_id];

    // Current balance (latest balance_after)
    const [balanceRows] = await pool.query(
      `SELECT balance_after as current_balance
       FROM sarga_petty_cash p
       ${branchFilter}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      branchParams
    );

    // Cash In this month
    const [cashInRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       transaction_type = 'Cash In' AND
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Cash Out this month
    const [cashOutRows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       transaction_type = 'Cash Out' AND
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Transaction count this month
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM sarga_petty_cash p
       ${branchFilter}
       ${branchFilter ? 'AND' : 'WHERE'}
       DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
      branchParams
    );

    // Recent transactions (ledger)
    const [ledgerRows] = await pool.query(
      `SELECT p.*, s.name as created_by_name, b.name as branch_name
       FROM sarga_petty_cash p
       LEFT JOIN sarga_staff s ON p.created_by = s.id
       LEFT JOIN sarga_branches b ON p.branch_id = b.id
       ${branchFilter}
       ORDER BY p.transaction_date DESC, p.created_at DESC
       LIMIT 50`,
      branchParams
    );

    res.json({
      current_balance: balanceRows.length > 0 ? balanceRows[0].current_balance : 0,
      cash_in_month: cashInRows[0].total,
      cash_out_month: cashOutRows[0].total,
      transaction_count: countRows[0].count,
      ledger: ledgerRows
    });
  } catch (error) {
    console.error('Petty cash dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get petty cash ledger with filters
router.get('/petty-cash-ledger', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { transaction_type, start_date, end_date } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (!['Admin', 'Accountant'].includes(role)) {
      whereClauses.push('p.branch_id = ?');
      params.push(branch_id);
    }

    if (transaction_type) {
      whereClauses.push('p.transaction_type = ?');
      params.push(transaction_type);
    }

    if (start_date) {
      whereClauses.push('p.transaction_date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('p.transaction_date <= ?');
      params.push(end_date);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_petty_cash p
      LEFT JOIN sarga_staff s ON p.created_by = s.id
      LEFT JOIN sarga_branches b ON p.branch_id = b.id
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT p.*, s.name as created_by_name, b.name as branch_name
      ${baseFrom}
      ORDER BY p.transaction_date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (error) {
    console.error('Get petty cash ledger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add petty cash transaction
router.post('/petty-cash', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, id: created_by, role: _role } = req.user;
    const {
      transaction_date, transaction_type, amount, description, reference_number,
      received_from, paid_to, category
    } = req.body;

    // Get current balance
    const [balanceRows] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? 
       ORDER BY transaction_date DESC, created_at DESC 
       LIMIT 1`,
      [branch_id]
    );

    let currentBalance = balanceRows.length > 0 ? parseFloat(balanceRows[0].balance_after) : 0;

    // Calculate new balance
    let newBalance = currentBalance;
    if (transaction_type === 'Opening') {
      newBalance = parseFloat(amount);
    } else if (transaction_type === 'Cash In') {
      newBalance = currentBalance + parseFloat(amount);
    } else if (transaction_type === 'Cash Out') {
      newBalance = currentBalance - parseFloat(amount);
    }

    const [result] = await pool.query(
      `INSERT INTO sarga_petty_cash 
       (branch_id, transaction_date, transaction_type, amount, description, reference_number, 
        balance_after, received_from, paid_to, category, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, transaction_date, transaction_type, amount, description, reference_number,
        newBalance, received_from, paid_to, category, created_by]
    );

    // SYNC WITH GLOBAL PAYMENTS TABLE (ONLY FOR CASH OUT)
    if (transaction_type === 'Cash Out') {
      await pool.query(`
        INSERT INTO sarga_payments 
        (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, reference_number, description, payment_date) 
        VALUES (?, 'Other', ?, ?, 'Cash', ?, 0, ?, ?, ?)
      `, [
        branch_id,
        paid_to || 'Petty Cash Payment',
        amount,
        amount,
        reference_number,
        `Petty Cash Out: ${category}${description ? ' - ' + description : ''}`,
        transaction_date || new Date()
      ]);
    }

    auditLog(req.user.id, 'PETTY_CASH_ADD', `Petty cash ${transaction_type}: ₹${amount} (${category || 'uncategorized'})`, { entity_type: 'petty_cash', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId, new_balance: newBalance });
  } catch (error) {
    console.error('Add petty cash transaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update petty cash transaction (Admin/Accountant only, recalculates balances)
router.put('/petty-cash/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins/accountants can edit petty cash transactions' });
    }

    const { id } = req.params;
    const {
      transaction_date, transaction_type, amount, description, reference_number,
      received_from, paid_to, category
    } = req.body;

    // Get the transaction to update
    const [txRows] = await pool.query('SELECT * FROM sarga_petty_cash WHERE id = ?', [id]);
    if (txRows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txRows[0];

    // Update the transaction
    await pool.query(
      `UPDATE sarga_petty_cash 
       SET transaction_date=?, transaction_type=?, amount=?, description=?, reference_number=?,
           received_from=?, paid_to=?, category=?
       WHERE id=?`,
      [transaction_date, transaction_type, amount, description, reference_number,
        received_from, paid_to, category, id]
    );

    // Recalculate all balances for this branch from the updated date onwards
    const [allTxs] = await pool.query(
      `SELECT * FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date >= ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [tx.branch_id, transaction_date]
    );

    // Get balance before this date
    const [prevBalance] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date < ?
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      [tx.branch_id, transaction_date]
    );

    let runningBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].balance_after) : 0;

    for (const t of allTxs) {
      if (t.transaction_type === 'Opening') {
        runningBalance = parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash In') {
        runningBalance += parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash Out') {
        runningBalance -= parseFloat(t.amount);
      }

      await pool.query(
        'UPDATE sarga_petty_cash SET balance_after = ? WHERE id = ?',
        [runningBalance, t.id]
      );
    }

    auditLog(req.user.id, 'PETTY_CASH_UPDATE', `Updated petty cash #${id}: ${transaction_type} ₹${amount}`, { entity_type: 'petty_cash', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Update petty cash error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete petty cash transaction (Admin/Accountant only)
router.delete('/petty-cash/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins/accountants can delete petty cash transactions' });
    }

    const { id } = req.params;

    // Get transaction details
    const [txRows] = await pool.query('SELECT * FROM sarga_petty_cash WHERE id = ?', [id]);
    if (txRows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txRows[0];

    await pool.query('DELETE FROM sarga_petty_cash WHERE id = ?', [id]);

    // Recalculate balances after deletion
    const [allTxs] = await pool.query(
      `SELECT * FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date >= ?
       ORDER BY transaction_date ASC, created_at ASC`,
      [tx.branch_id, tx.transaction_date]
    );

    const [prevBalance] = await pool.query(
      `SELECT balance_after FROM sarga_petty_cash 
       WHERE branch_id = ? AND transaction_date < ?
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      [tx.branch_id, tx.transaction_date]
    );

    let runningBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].balance_after) : 0;

    for (const t of allTxs) {
      if (t.transaction_type === 'Opening') {
        runningBalance = parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash In') {
        runningBalance += parseFloat(t.amount);
      } else if (t.transaction_type === 'Cash Out') {
        runningBalance -= parseFloat(t.amount);
      }

      await pool.query(
        'UPDATE sarga_petty_cash SET balance_after = ? WHERE id = ?',
        [runningBalance, t.id]
      );
    }

    auditLog(req.user.id, 'PETTY_CASH_DELETE', `Deleted petty cash #${id}: ${tx.transaction_type} ₹${tx.amount}`, { entity_type: 'petty_cash', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete petty cash error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== BILLS & DOCUMENTS STORAGE ==========

// Get bills/documents with search filters
router.get('/bills-documents', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { document_type, vendor_name, start_date, end_date, related_tab } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (!['Admin', 'Accountant'].includes(role)) {
      whereClauses.push('bd.branch_id = ?');
      params.push(branch_id);
    }

    if (document_type) {
      whereClauses.push('bd.document_type = ?');
      params.push(document_type);
    }

    if (vendor_name) {
      whereClauses.push('bd.vendor_name LIKE ?');
      params.push(`%${vendor_name}%`);
    }

    if (start_date) {
      whereClauses.push('bd.bill_date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      whereClauses.push('bd.bill_date <= ?');
      params.push(end_date);
    }

    if (related_tab) {
      whereClauses.push('bd.related_tab = ?');
      params.push(related_tab);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_bills_documents bd
      LEFT JOIN sarga_staff s ON bd.uploaded_by = s.id
      LEFT JOIN sarga_branches b ON bd.branch_id = b.id
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT bd.*, s.name as uploaded_by_name, b.name as branch_name
      ${baseFrom}
      ORDER BY bd.bill_date DESC, bd.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (error) {
    console.error('Get bills/documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full bill/document details (document + linked vendor bill + items)
router.get('/bills-documents/:id/full', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, role } = req.user;
    const { id } = req.params;

    const [docRows] = await pool.query(
      `SELECT bd.*, s.name as uploaded_by_name, b.name as branch_name
       FROM sarga_bills_documents bd
       LEFT JOIN sarga_staff s ON bd.uploaded_by = s.id
       LEFT JOIN sarga_branches b ON bd.branch_id = b.id
       WHERE bd.id = ?
       LIMIT 1`,
      [id]
    );

    if (!docRows.length) {
      return res.status(404).json({ error: 'Bill/document not found' });
    }

    const document = docRows[0];
    if (!['Admin', 'Accountant'].includes(role) && Number(document.branch_id) !== Number(branch_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let vendorBill = null;
    let items = [];

    if (document.document_type === 'Vendor Bill') {
      const documentVendorKey = vendorMatchKey(document.vendor_name);

      const [vendorRows] = await pool.query(
        `SELECT id, name
         FROM vendors
         WHERE is_active = TRUE AND (branch_id = ? OR branch_id IS NULL)
         ORDER BY id DESC`,
        [document.branch_id]
      );

      const vendor = vendorRows.find((row) => vendorMatchKey(row.name) === documentVendorKey) || null;

      if (vendor?.id) {
        const [billRows] = await pool.query(
          `SELECT b.*, v.name as vendor_name, br.name as branch_name
           FROM sarga_vendor_bills b
           JOIN sarga_vendors v ON b.vendor_id = v.id
           JOIN sarga_branches br ON b.branch_id = br.id
           WHERE b.vendor_id = ?
             AND b.branch_id = ?
             AND b.bill_date = ?
             AND (b.bill_number = ? OR (? IS NULL AND b.bill_number IS NULL))
             AND ABS(COALESCE(b.total_amount, 0) - ?) < 0.01
           ORDER BY b.created_at DESC
           LIMIT 1`,
          [
            vendor.id,
            document.branch_id,
            document.bill_date,
            document.bill_number || null,
            document.bill_number || null,
            Number(document.amount) || 0
          ]
        );

        if (billRows.length) {
          vendorBill = billRows[0];
          const [itemRows] = await pool.query(
            `SELECT i.id, i.bill_id, i.inventory_item_id, i.quantity, i.unit_cost, i.total_cost,
                    inv.name as item_name, inv.sku as item_sku, inv.unit as item_unit
             FROM sarga_vendor_bill_items i
             LEFT JOIN sarga_inventory inv ON inv.id = i.inventory_item_id
             WHERE i.bill_id = ?
             ORDER BY i.id ASC`,
            [vendorBill.id]
          );
          items = itemRows;
        }
      }
    }

    res.json({
      document,
      vendor_bill: vendorBill,
      items
    });
  } catch (error) {
    console.error('Get full bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload bill/document (file + metadata)
router.post('/bills-documents/upload', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), uploadDocs.single('file'), async (req, res) => {
  try {
    const { branch_id, id: uploaded_by } = req.user;
    const {
      document_type, related_tab, related_id, vendor_name, vendor_gstin, bill_number, bill_date,
      amount, subtotal, tax_amount, sgst_amount, cgst_amount, gst_confidence, gst_category,
      description, line_items, force_duplicate, stock_branch_id
    } = req.body;
    const normalizedDocumentType = normalizeBillDocumentType(document_type, related_tab);
    const normalizedLineItems = normalizeLineItemsInput(line_items);
    const allowDuplicate = String(force_duplicate || '').trim() === '1';

    // Safely parse bill_date or default to today's date if not provided / invalid
    const resolvedBillDate = (bill_date && !isNaN(new Date(bill_date).getTime()))
      ? bill_date
      : new Date().toISOString().split('T')[0];

    let filePath = null;
    let fileName = null;
    let fileType = null;
    let fileSizeKb = null;

    if (req.file) {
      try {
        const cloudinaryResult = await uploadToCloudinary(req.file.path, 'bills-documents');
        filePath = cloudinaryResult.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error for bill document:', uploadError);
        // Fallback to local path if Cloudinary fails
        filePath = `/uploads/${req.file.filename}`;
      }
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
      fileSizeKb = Math.ceil(req.file.size / 1024);
    }

    // Prevent accidental duplicate uploads unless user explicitly confirms override.
    if (!allowDuplicate) {
      const [possibleDuplicateRows] = await pool.query(
        `SELECT id, file_name, created_at
         FROM sarga_bills_documents
         WHERE branch_id = ?
           AND document_type = ?
           AND COALESCE(LOWER(vendor_name), '') = COALESCE(LOWER(?), '')
           AND bill_date = ?
           AND ABS(COALESCE(amount, 0) - ?) < 0.01
           AND ((? IS NULL OR ? = '') OR COALESCE(LOWER(bill_number), '') = COALESCE(LOWER(?), ''))
         ORDER BY id DESC
         LIMIT 1`,
        [
          branch_id,
          normalizedDocumentType,
          vendor_name || null,
          resolvedBillDate,
          Number(amount) || 0,
          bill_number || null,
          bill_number || null,
          bill_number || null
        ]
      );

      if (possibleDuplicateRows.length > 0) {
        return res.status(409).json({
          error: 'Possible duplicate bill found. Is this another bill?',
          code: 'POSSIBLE_DUPLICATE_BILL',
          duplicate: possibleDuplicateRows[0]
        });
      }
    }

    // Keep vendor master in sync so Vendors tab can show bill vendors.
    const vendorId = await ensureVendorExistsFromBill({
      vendorName: vendor_name,
      documentType: normalizedDocumentType,
      branchId: branch_id
    });

    // Compute extraction confidence from provided data
    const fieldScores = [];
    if (vendor_name) fieldScores.push(vendor_name.length >= 3 ? 0.95 : 0.6);
    if (bill_number) fieldScores.push(/^[A-Z0-9\/\-]{2,20}$/i.test(bill_number) ? 0.95 : 0.7);
    if (resolvedBillDate) { const d = new Date(resolvedBillDate); fieldScores.push(!isNaN(d.getTime()) ? 0.98 : 0.6); }
    if (amount && Number(amount) > 0) fieldScores.push(0.95);
    const uploadConfidence = fieldScores.length > 0
      ? Math.round((fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length) * 100) / 100
      : null;

    const [result] = await pool.query(
      `INSERT INTO sarga_bills_documents 
       (branch_id, document_type, related_tab, related_id, vendor_name, vendor_gstin, bill_number, bill_date,
        amount, subtotal, tax_amount, sgst_amount, cgst_amount, gst_confidence, gst_category,
        file_path, file_name, file_type, file_size_kb, description, line_items, uploaded_by,
        extraction_confidence, extraction_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch_id,
        normalizedDocumentType,
        related_tab || null,
        related_id || null,
        vendor_name || null,
        vendor_gstin || null,
        bill_number || null,
        resolvedBillDate,
        amount || null,
        subtotal || null,
        tax_amount || null,
        sgst_amount || null,
        cgst_amount || null,
        gst_confidence || null,
        gst_category || null,
        filePath,
        fileName,
        fileType,
        fileSizeKb,
        description || null,
        typeof line_items === 'string' ? line_items : (normalizedLineItems.length > 0 ? JSON.stringify(normalizedLineItems) : null),
        uploaded_by,
        uploadConfidence,
        'completed'
      ]
    );

    // Sync vendor bill into sarga_vendor_bills so vendor purchases/balance/transaction history work.
    let vendorBillId = null;
    if (normalizedDocumentType === 'Vendor Bill' && vendorId) {
      try {
        const [vbResult] = await pool.query(
          `INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [vendorId, branch_id, bill_number || null, bill_date, Number(amount) || 0, description || null]
        );
        vendorBillId = vbResult.insertId;
      } catch (vbError) {
        console.error('Vendor bill record creation failed:', vbError);
      }
    }

    // Vendor bill line-items should appear in Inventory immediately after upload.
    if (normalizedDocumentType === 'Vendor Bill' && normalizedLineItems.length > 0) {
      try {
        const syncedItems = await syncLineItemsToInventory({
          lineItems: normalizedLineItems,
          vendorName: vendor_name
        });

        // Link line items to the vendor bill record for transaction detail
        if (vendorBillId && syncedItems?.length) {
          for (const item of syncedItems) {
            const matchingLine = normalizedLineItems.find(
              (li) => li.item_name.toLowerCase() === item.name.toLowerCase()
            );
            if (matchingLine && item.inventoryId) {
              await pool.query(
                `INSERT INTO sarga_vendor_bill_items (bill_id, inventory_item_id, quantity, unit_cost, total_cost)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  vendorBillId,
                  item.inventoryId,
                  Number(matchingLine.quantity) || 0,
                  Number(matchingLine.rate) || 0,
                  Number(matchingLine.total_amount || (matchingLine.quantity * matchingLine.rate)) || 0
                ]
              );
            }
          }
        }

        for (const item of syncedItems || []) {
          if (item.skipProductLibrary) {
            continue;
          }
          await ensureProductLibraryFromInventoryItem({
            inventoryId: item.inventoryId,
            name: item.name,
            category: item.subcategoryName || item.categoryName || item.category,
            costPrice: item.sellPrice,    // bill rate = our purchase cost, not selling price
            userSellPrice: item.userSellPrice || 0,
            customSku: item.customSku || null,
            subcategoryId: item.subcategoryId || null
          });
        }
        // New products were created — clear the 5-min hierarchy cache so they appear immediately
        invalidateHierarchyCache();

        // Update per-branch stock so inter-branch stock requests reflect real quantities
        const targetBranchId = Number(stock_branch_id) || branch_id;
        if (targetBranchId) {
          for (const item of syncedItems || []) {
            if (!item.inventoryId) continue;
            const lineItem = normalizedLineItems.find(
              li => String(li.item_name || '').toLowerCase() === String(item.name || '').toLowerCase()
            );
            const qty = Number(lineItem?.quantity) || 0;
            if (qty > 0) {
              try {
                const [bsBefore] = await pool.query(
                  'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                  [item.inventoryId, targetBranchId]
                );
                const qtyBefore = Number(bsBefore[0]?.quantity || 0);
                await pool.query(
                  `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
                   VALUES (?, ?, ?)
                   ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), updated_at = CURRENT_TIMESTAMP`,
                  [item.inventoryId, targetBranchId, qty]
                );
                // Recalculate global inventory quantity from branch stock sum
                await pool.query(
                  `UPDATE sarga_inventory i SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) WHERE id = ?`,
                  [item.inventoryId]
                );
                // Log movement
                await pool.query(
                  `INSERT INTO sarga_inventory_movement_log (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
                   VALUES (?, ?, 'Purchase', ?, ?, ?, 'bill_upload', ?, 'Stock added from bill upload', ?)`,
                  [item.inventoryId, targetBranchId, qty, qtyBefore, qtyBefore + qty, result.insertId, req.user.id]
                );
              } catch (bsErr) {
                console.error('Branch stock upsert failed for item', item.inventoryId, bsErr.message);
              }
            }
          }
        }
      } catch (inventorySyncError) {
        console.error('Inventory sync from bill upload failed:', inventorySyncError);
      }
    }

    auditLog(req.user.id, 'BILL_UPLOAD', `Uploaded bill: ${req.file.originalname}`, { entity_type: 'bill_document', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId, file_path: filePath });
  } catch (error) {
    console.error('Upload bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add bill/document metadata
router.post('/bills-documents', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { branch_id, id: uploaded_by } = req.user;
    const {
      document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
      amount, file_path, file_name, file_type, file_size_kb, description
    } = req.body;
    const normalizedDocumentType = normalizeBillDocumentType(document_type, related_tab);

    // Keep vendor master in sync so Vendors tab can show bill vendors.
    const vendorId = await ensureVendorExistsFromBill({
      vendorName: vendor_name,
      documentType: normalizedDocumentType,
      branchId: branch_id
    });

    const [result] = await pool.query(
      `INSERT INTO sarga_bills_documents 
       (branch_id, document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
        amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, normalizedDocumentType, related_tab, related_id, vendor_name, bill_number, bill_date,
        amount, file_path, file_name, file_type, file_size_kb, description, uploaded_by]
    );

    // Sync vendor bill into sarga_vendor_bills so vendor purchases/balance/transaction history work.
    if (normalizedDocumentType === 'Vendor Bill' && vendorId) {
      try {
        await pool.query(
          `INSERT INTO sarga_vendor_bills (vendor_id, branch_id, bill_number, bill_date, total_amount, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [vendorId, branch_id, bill_number || null, bill_date, Number(amount) || 0, description || null]
        );
      } catch (vbError) {
        console.error('Vendor bill record creation failed:', vbError);
      }
    }

    auditLog(req.user.id, 'BILL_DOCUMENT_ADD', `Added bill document: ${normalizedDocumentType} ${vendor_name || ''} ₹${amount || 0}`, { entity_type: 'bill_document', entity_id: result.insertId });
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update bill/document metadata
router.put('/bills-documents/:id', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      document_type, related_tab, related_id, vendor_name, bill_number, bill_date,
      amount, description
    } = req.body;
    const normalizedDocumentType = normalizeBillDocumentType(document_type, related_tab);

    // Keep vendor master in sync when vendor name is updated on a document.
    await ensureVendorExistsFromBill({
      vendorName: vendor_name,
      documentType: normalizedDocumentType,
      branchId: req.user.branch_id
    });

    await pool.query(
      `UPDATE sarga_bills_documents 
       SET document_type=?, related_tab=?, related_id=?, vendor_name=?, bill_number=?, 
           bill_date=?, amount=?, description=?
       WHERE id=?`,
      [normalizedDocumentType, related_tab, related_id, vendor_name, bill_number, bill_date,
        amount, description, id]
    );

    auditLog(req.user.id, 'BILL_DOCUMENT_UPDATE', `Updated bill document #${id}: ${normalizedDocumentType}`, { entity_type: 'bill_document', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Update bill/document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete bill/document
router.delete('/bills-documents/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins/accountants can delete documents' });
    }

    const { id } = req.params;
    const deleteInventory = String(req.query.deleteInventory || '').trim() === '1';
    const [rows] = await pool.query(
      `SELECT id, branch_id, document_type, vendor_name, bill_number, bill_date, amount, file_path
       FROM sarga_bills_documents
       WHERE id = ?`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Bill document not found' });
    }

    const document = rows[0];

    // Optional rollback: remove vendor bill + reverse inventory quantities created from this bill.
    if (deleteInventory && String(document.document_type || '').toLowerCase() === 'vendor bill') {
      const vendorKey = vendorMatchKey(document.vendor_name || '');
      let vendorId = null;

      if (vendorKey) {
        const [vendorRows] = await pool.query(
          `SELECT id, name
           FROM vendors
           WHERE is_active = TRUE AND (branch_id = ? OR branch_id IS NULL)
           ORDER BY id DESC`,
          [document.branch_id]
        );
        const matchedVendor = vendorRows.find((row) => vendorMatchKey(row.name) === vendorKey) || null;
        vendorId = matchedVendor?.id || null;
      }

      if (vendorId) {
        const [vendorBills] = await pool.query(
          `SELECT id
           FROM sarga_vendor_bills
           WHERE vendor_id = ?
             AND branch_id = ?
             AND bill_date = ?
             AND (bill_number = ? OR (? IS NULL AND bill_number IS NULL))
             AND ABS(COALESCE(total_amount, 0) - ?) < 0.01`,
          [
            vendorId,
            document.branch_id,
            document.bill_date,
            document.bill_number || null,
            document.bill_number || null,
            Number(document.amount) || 0
          ]
        );

        for (const vb of vendorBills) {
          const [vbItems] = await pool.query(
            'SELECT inventory_item_id, quantity FROM sarga_vendor_bill_items WHERE bill_id = ?',
            [vb.id]
          );

          const touchedInventoryIds = [];
          for (const item of vbItems) {
            if (!item.inventory_item_id) continue;
            touchedInventoryIds.push(item.inventory_item_id);
            const invId = item.inventory_item_id;
            const qty = Number(item.quantity) || 0;

            // Revert branch-level stock first, then recalc global
            const branchId = document.branch_id || req.user?.branch_id;
            if (branchId) {
              const [bsBefore] = await pool.query(
                'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
                [invId, branchId]
              );
              const qtyBefore = Number(bsBefore[0]?.quantity || 0);
              await pool.query(
                'UPDATE sarga_branch_stock SET quantity = GREATEST(quantity - ?, 0) WHERE inventory_item_id = ? AND branch_id = ?',
                [qty, invId, branchId]
              );
              // Recalculate global inventory quantity from branch stock sum
              await pool.query(
                `UPDATE sarga_inventory i SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) WHERE id = ?`,
                [invId]
              );
              // Log movement
              await pool.query(
                `INSERT INTO sarga_inventory_movement_log (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, created_by)
                 VALUES (?, ?, 'Adjustment', ?, ?, GREATEST(?, 0), 'bill_delete', ?, ?)`,
                [invId, branchId, -qty, qtyBefore, qtyBefore - qty, id, req.user.id]
              );
            } else {
              // Fallback: no branch context — deduct from global directly
              await pool.query(
                'UPDATE sarga_inventory SET quantity = GREATEST(COALESCE(quantity, 0) - ?, 0) WHERE id = ?',
                [qty, invId]
              );
            }
          }

          await pool.query('DELETE FROM sarga_vendor_bill_items WHERE bill_id = ?', [vb.id]);
          await pool.query('DELETE FROM sarga_vendor_bills WHERE id = ?', [vb.id]);

          const uniqueIds = [...new Set(touchedInventoryIds.filter(Boolean))];
          if (uniqueIds.length > 0) {
            const placeholders = uniqueIds.map(() => '?').join(',');
            const [zeroQtyRows] = await pool.query(
              `SELECT id FROM sarga_inventory WHERE id IN (${placeholders}) AND COALESCE(quantity, 0) <= 0`,
              uniqueIds
            );
            const zeroIds = zeroQtyRows.map((r) => r.id);
            if (zeroIds.length > 0) {
              const zeroPlaceholders = zeroIds.map(() => '?').join(',');
              await pool.query(
                `UPDATE sarga_products
                 SET inventory_item_id = NULL, is_physical_product = 0
                 WHERE inventory_item_id IN (${zeroPlaceholders})`,
                zeroIds
              );
              await pool.query(
                `DELETE FROM sarga_inventory WHERE id IN (${zeroPlaceholders})`,
                zeroIds
              );
            }
          }
        }
      }
    }

    await pool.query('DELETE FROM sarga_bills_documents WHERE id = ?', [id]);

    if (document.file_path && document.file_path.startsWith('/uploads/')) {
      const fileName = path.basename(document.file_path);
      const filePath = path.join(uploadsDir, fileName);
      if (filePath.startsWith(uploadsDir)) {
        fs.promises.unlink(filePath).catch(() => null);
      }
    }

    auditLog(req.user.id, 'BILL_DOCUMENT_DELETE', `Deleted bill document #${id}`, { entity_type: 'bill_document', entity_id: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete bill/document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual correction endpoint for extracted fields
router.post('/bills-documents/:id/manual-correct', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  try {
    const { id } = req.params;
    const { field_name, corrected_value } = req.body;

    if (!field_name) {
      return res.status(400).json({ error: 'field_name is required' });
    }

    const [docRows] = await pool.query(
      'SELECT id FROM sarga_bills_documents WHERE id = ?', [id]
    );
    if (!docRows.length) {
      return res.status(404).json({ error: 'Bill document not found' });
    }

    // Update the document field if it maps to a document column
    const fieldMap = {
      vendor_name: 'vendor_name',
      bill_number: 'bill_number',
      bill_date: 'bill_date',
      amount: 'amount',
      total_amount: 'amount',
      tax_amount: 'tax_amount',
      subtotal: 'subtotal'
    };
    const dbColumn = fieldMap[field_name];
    if (dbColumn) {
      const updateData = {};
      updateData[dbColumn] = corrected_value;
      await pool.query(`UPDATE sarga_bills_documents SET ? WHERE id = ?`, [updateData, id]);
    }

    // Log the correction
    await pool.query(
      `UPDATE sarga_bill_extraction_logs 
       SET is_corrected = 1, corrected_value = ?, corrected_by = ?, corrected_at = NOW()
       WHERE bill_document_id = ? AND field_name = ?
       ORDER BY id DESC LIMIT 1`,
      [corrected_value || null, req.user.id, id, field_name]
    );

    // If no log row existed, insert one
    const [logRows] = await pool.query(
      `SELECT id FROM sarga_bill_extraction_logs 
       WHERE bill_document_id = ? AND field_name = ? LIMIT 1`,
      [id, field_name]
    );
    if (logRows.length === 0) {
      await pool.query(
        `INSERT INTO sarga_bill_extraction_logs 
         (bill_document_id, extraction_type, field_name, extracted_value, confidence_score, is_corrected, corrected_value, corrected_by, corrected_at, ocr_engine)
         VALUES (?, 'manual', ?, NULL, 0, 1, ?, ?, NOW(), 'manual')`,
        [id, field_name, corrected_value || null, req.user.id]
      );
    }

    // Mark document as manually corrected
    await pool.query(
      `UPDATE sarga_bills_documents 
       SET extraction_status = 'manual', manual_correction_required = 0
       WHERE id = ?`,
      [id]
    );

    auditLog(req.user.id, 'BILL_MANUAL_CORRECT', `Manual correction on bill #${id}: ${field_name} = ${corrected_value}`, {
      entity_type: 'bill_document', entity_id: id
    });

    res.json({ success: true, message: `Field '${field_name}' corrected` });
  } catch (error) {
    console.error('Manual correction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get extraction logs for a bill document
router.get('/bills-documents/:id/extraction-logs', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const [logs] = await pool.query(
      `SELECT id, extraction_type, field_name, extracted_value, confidence_score,
              is_corrected, corrected_value, corrected_by, corrected_at,
              ocr_engine, processing_time_ms, error_message, created_at
       FROM sarga_bill_extraction_logs
       WHERE bill_document_id = ?
       ORDER BY created_at ASC`,
      [id]
    );
    res.json(logs);
  } catch (error) {
    console.error('Get extraction logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get inventory products for bill linking
router.get('/bills-documents/suggest-products', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { keyword, category } = req.query;

    let query = `
      SELECT id, name, sku, category, unit, quantity,
             reorder_level, cost_price, sell_price, hsn, gst_rate, created_at
      FROM sarga_inventory
      WHERE 1=1
    `;
    const params = [];

    if (keyword) {
      const keywords = keyword.split(/[\s,]+/).filter(k => k.length >= 2);
      if (keywords.length > 0) {
        const conditions = keywords.map(() => '(name LIKE ? OR category LIKE ? OR sku LIKE ?)');
        query += ' AND (' + conditions.join(' OR ') + ')';
        keywords.forEach(k => {
          params.push(`%${k}%`, `%${k}%`, `%${k}%`);
        });
      }
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY name ASC LIMIT 20';

    const [products] = await pool.query(query, params);
    res.json(products);
  } catch (error) {
    console.error('Suggest products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link bill document to inventory product
router.post('/bills-documents/:id/link-product', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { id } = req.params;
    const { product_id, quantity, unit_price, add_to_inventory } = req.body;

    // Update bill document with product link
    await pool.query(
      `UPDATE sarga_bills_documents SET product_id = ?, product_quantity = ?, product_unit_price = ?
       WHERE id = ?`,
      [product_id, quantity, unit_price, id]
    );

    // If add_to_inventory is true, add to branch stock and recalc global quantity
    if (add_to_inventory && product_id) {
      const qty = Number(quantity) || 0;
      // Fetch the bill's branch to assign stock to the correct branch
      const [docRows] = await pool.query('SELECT branch_id FROM sarga_bills_documents WHERE id = ?', [id]);
      const branchId = docRows[0]?.branch_id || req.user?.branch_id;
      if (branchId) {
        const [bsBefore] = await pool.query(
          'SELECT quantity FROM sarga_branch_stock WHERE inventory_item_id = ? AND branch_id = ?',
          [product_id, branchId]
        );
        const qtyBefore = Number(bsBefore[0]?.quantity || 0);
        await pool.query(
          `INSERT INTO sarga_branch_stock (inventory_item_id, branch_id, quantity)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP`,
          [product_id, branchId, qty, qty]
        );
        // Recalculate global inventory quantity from branch stock sum
        await pool.query(
          `UPDATE sarga_inventory i SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM sarga_branch_stock WHERE inventory_item_id = i.id) WHERE id = ?`,
          [product_id]
        );
        // Log movement
        await pool.query(
          `INSERT INTO sarga_inventory_movement_log (inventory_item_id, branch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, created_by)
           VALUES (?, ?, 'Purchase', ?, ?, ?, 'bill_link', ?, ?)`,
          [product_id, branchId, qty, qtyBefore, qtyBefore + qty, id, req.user.id]
        );
      } else {
        // Fallback: no branch context — update global directly
        await pool.query(
          `UPDATE sarga_inventory SET quantity = quantity + ? WHERE id = ?`,
          [qty, product_id]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Link product error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== REPORTS & ANALYTICS ==========
const buildBranchFilter = (alias, req, params) => {
  if (!['Admin', 'Accountant'].includes(req.user.role)) {
    params.push(req.user.branch_id);
    return ` AND ${alias}.branch_id = ?`;
  }
  if (req.query.branch_id) {
    params.push(req.query.branch_id);
    return ` AND ${alias}.branch_id = ?`;
  }
  return '';
};

const buildDateFilter = (field, startDate, endDate, params) => {
  let filter = '';
  if (startDate) {
    filter += ` AND ${field} >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    filter += ` AND ${field} <= ?`;
    params.push(endDate);
  }
  return filter;
};

const buildExpenseUnionQuery = (req, startDate, endDate) => {
  const params = [];
  const paymentFilters = `${buildBranchFilter('p', req, params)}${buildDateFilter('p.payment_date', startDate, endDate, params)}`;
  const officeFilters = `${buildBranchFilter('o', req, params)}${buildDateFilter('o.expense_date', startDate, endDate, params)}`;
  const transportFilters = `${buildBranchFilter('t', req, params)}${buildDateFilter('t.expense_date', startDate, endDate, params)}`;
  const miscFilters = `${buildBranchFilter('m', req, params)}${buildDateFilter('m.expense_date', startDate, endDate, params)}`;
  const pettyFilters = `${buildBranchFilter('pc', req, params)}${buildDateFilter('pc.transaction_date', startDate, endDate, params)}`;

  const query = `
    SELECT p.payment_date as expense_date, p.amount, p.type as category, p.type as sub_category, p.branch_id,
           p.payee_name as payee, p.payment_method as payment_method
    FROM sarga_payments p
    WHERE 1=1 ${paymentFilters}
    UNION ALL
    SELECT o.expense_date, o.amount, 'Office & Admin' as category, o.expense_type as sub_category, o.branch_id,
           o.vendor_name as payee, o.payment_method as payment_method
    FROM sarga_office_expenses o
    WHERE 1=1 ${officeFilters}
    UNION ALL
    SELECT t.expense_date, t.amount, 'Transport & Delivery' as category, t.transport_type as sub_category, t.branch_id,
           COALESCE(t.driver_name, t.vehicle_number) as payee, t.payment_method as payment_method
    FROM sarga_transport_expenses t
    WHERE 1=1 ${transportFilters}
    UNION ALL
    SELECT m.expense_date, m.amount, 'Miscellaneous' as category, m.expense_category as sub_category, m.branch_id,
           m.vendor_name as payee, m.payment_method as payment_method
    FROM sarga_misc_expenses m
    WHERE 1=1 ${miscFilters}
    UNION ALL
    SELECT pc.transaction_date as expense_date, pc.amount, 'Petty Cash' as category,
           COALESCE(pc.category, 'Petty Cash') as sub_category, pc.branch_id,
           pc.paid_to as payee, 'Cash' as payment_method
    FROM sarga_petty_cash pc
    WHERE pc.transaction_type = 'Cash Out' ${pettyFilters}
  `;

  return { query, params };
};

const getDefaultStartDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const getDefaultEndDate = () => new Date().toISOString().slice(0, 10);

router.get('/reports/monthly-expenses', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const startDate = req.query.start_date || getDefaultStartDate();
    const endDate = req.query.end_date || getDefaultEndDate();

    const unionA = buildExpenseUnionQuery(req, startDate, endDate);
    const [monthlyRows] = await pool.query(
      `SELECT DATE_FORMAT(expense_date, '%Y-%m') as month, SUM(amount) as total
       FROM (${unionA.query}) x
       GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
       ORDER BY month ASC`,
      unionA.params
    );

    const unionB = buildExpenseUnionQuery(req, startDate, endDate);
    const [categoryRows] = await pool.query(
      `SELECT category, SUM(amount) as total
       FROM (${unionB.query}) x
       GROUP BY category
       ORDER BY total DESC`,
      unionB.params
    );

    res.json({
      rows: monthlyRows,
      categories: categoryRows,
      filters: { start_date: startDate, end_date: endDate }
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/category-wise', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [categoryRows] = await pool.query(
      `SELECT category, SUM(amount) as total
       FROM (${unionA.query}) x
       GROUP BY category
       ORDER BY total DESC`,
      unionA.params
    );

    const unionB = buildExpenseUnionQuery(req, start_date, end_date);
    const [subCategoryRows] = await pool.query(
      `SELECT category, sub_category, SUM(amount) as total
       FROM (${unionB.query}) x
       GROUP BY category, sub_category
       ORDER BY category ASC, total DESC`,
      unionB.params
    );

    res.json({ rows: categoryRows, breakdown: subCategoryRows });
  } catch (error) {
    console.error('Category report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/branch-wise', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [rows] = await pool.query(
      `SELECT b.name as branch_name, x.category, SUM(x.amount) as total
       FROM (${unionA.query}) x
       JOIN sarga_branches b ON x.branch_id = b.id
       GROUP BY b.name, x.category
       ORDER BY b.name ASC, total DESC`,
      unionA.params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Branch report error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/vendor-ledger', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { vendor_id, vendor_name, start_date, end_date } = req.query;
    const params = [];
    let filter = " WHERE p.type = 'Vendor'";
    filter += buildBranchFilter('p', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    if (vendor_id) {
      filter += ' AND p.vendor_id = ?';
      params.push(vendor_id);
    }
    if (vendor_name) {
      filter += ' AND p.payee_name LIKE ?';
      params.push(`%${vendor_name}%`);
    }

    const [rows] = await pool.query(
      `SELECT p.*, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Vendor ledger error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/utility-statement', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date, utility_type } = req.query;
    const payParams = [];
    let payFilter = " WHERE p.type = 'Utility'";
    payFilter += buildBranchFilter('p', req, payParams);
    payFilter += buildDateFilter('p.payment_date', start_date, end_date, payParams);
    if (utility_type) { payFilter += " AND p.payee_name = ?"; payParams.push(utility_type); }

    const [payments] = await pool.query(
      `SELECT p.id, p.payee_name, p.amount, p.payment_method, p.reference_number, p.description, p.payment_date, p.branch_id, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${payFilter}
       ORDER BY p.payment_date DESC`,
      payParams
    );

    const billParams = [];
    let billFilter = " WHERE 1=1";
    if (!['Admin', 'Accountant'].includes(req.user.role)) { billFilter += " AND ub.branch_id = ?"; billParams.push(req.user.branch_id); }
    if (start_date) { billFilter += " AND ub.bill_date >= ?"; billParams.push(start_date); }
    if (end_date) { billFilter += " AND ub.bill_date <= ?"; billParams.push(end_date); }
    if (utility_type) { billFilter += " AND ub.utility_type = ?"; billParams.push(utility_type); }

    const [bills] = await pool.query(
      `SELECT ub.*, b.name as branch_name
       FROM sarga_utility_bills ub
       JOIN sarga_branches b ON ub.branch_id = b.id
       ${billFilter}
       ORDER BY ub.bill_date DESC`,
      billParams
    );

    res.json({ payments, bills, rows: payments });
  } catch (error) {
    console.error('Utility statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Structured summary: categories with their connections and latest bill status
router.get('/reports/utility-summary-by-connection', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const connParams = [];
    let connFilter = ' WHERE 1=1';
    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      connFilter += ' AND uc.branch_id = ?';
      connParams.push(req.user.branch_id);
    } else if (req.query.branch_id) {
      connFilter += ' AND uc.branch_id = ?';
      connParams.push(req.query.branch_id);
    }

    const [connections] = await pool.query(`
      SELECT uc.*, b.name as branch_name
      FROM sarga_utility_connections uc
      JOIN sarga_branches b ON uc.branch_id = b.id
      ${connFilter}
      ORDER BY uc.utility_type, uc.label
    `, connParams);

    // Get latest bill per connection
    const connectionIds = connections.map(c => c.id);
    const latestBills = {};
    if (connectionIds.length > 0) {
      const placeholders = connectionIds.map(() => '?').join(',');
      const [bills] = await pool.query(`
        SELECT ub.* FROM sarga_utility_bills ub
        WHERE ub.connection_record_id IN (${placeholders})
          AND ub.bill_date = (
            SELECT MAX(ub2.bill_date) FROM sarga_utility_bills ub2
            WHERE ub2.connection_record_id = ub.connection_record_id
          )
        ORDER BY ub.bill_date DESC
      `, connectionIds);
      bills.forEach(b => { latestBills[b.connection_record_id] = b; });
    }

    // Group by utility_type (category)
    const categories = {};
    for (const c of connections) {
      const cat = c.utility_type;
      if (!categories[cat]) categories[cat] = { category: cat, connections: [] };
      categories[cat].connections.push({
        id: c.id,
        label: c.label,
        connection_id: c.connection_id,
        provider: c.provider,
        billing_cycle: c.billing_cycle,
        is_active: !!c.is_active,
        branch_id: c.branch_id,
        branch_name: c.branch_name,
        latest_bill: latestBills[c.id] ? {
          id: latestBills[c.id].id,
          bill_number: latestBills[c.id].bill_number,
          bill_date: latestBills[c.id].bill_date,
          amount: latestBills[c.id].amount,
          description: latestBills[c.id].description
        } : null
      });
    }

    res.json({ categories: Object.values(categories) });
  } catch (error) {
    console.error('Utility summary by connection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record a utility bill
router.post('/utility-bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  const { utility_type, amount, bill_number, bill_date, description, connection_id, connection_record_id, branch_id, force_duplicate } = req.body;
  const finalBranchId = ['Admin', 'Accountant'].includes(req.user.role) ? (branch_id || req.user.branch_id) : req.user.branch_id;

  if (!utility_type || !amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Utility type and amount are required' });
  }

  try {
    // Period-based duplicate check for utility bills (soft block)
    if (connection_record_id && bill_date && Number(amount) > 0 && !force_duplicate) {
      try {
        const [[connection]] = await pool.query(
          'SELECT billing_cycle FROM sarga_utility_connections WHERE id = ?',
          [connection_record_id]
        );
        const cycle = connection?.billing_cycle || 'monthly';
        const windowDays = cycle === 'bimonthly' ? 30 : 15;

        const [dupes] = await pool.query(
          `SELECT id, bill_date, amount, bill_number
           FROM sarga_utility_bills
           WHERE connection_record_id = ?
             AND ABS(DATEDIFF(bill_date, ?)) <= ?
             AND ABS(COALESCE(amount, 0) - ?) < GREATEST(COALESCE(amount, 0) * 0.10, 1)`,
          [connection_record_id, bill_date, windowDays, Number(amount)]
        );

        if (dupes.length > 0) {
          return res.status(409).json({
            error: 'A utility bill for this connection already exists within this billing period.',
            code: 'POSSIBLE_DUPLICATE_UTILITY_BILL',
            duplicate: dupes[0],
            message: `Found existing bill from ${dupes[0].bill_date} for ₹${Number(dupes[0].amount).toFixed(2)}`
          });
        }
      } catch (dupErr) {
        console.warn('Utility bill duplicate check error:', dupErr.message);
      }
    }

    const [result] = await pool.query(
      "INSERT INTO sarga_utility_bills (utility_type, branch_id, bill_number, bill_date, amount, description, connection_id, connection_record_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [utility_type, finalBranchId, bill_number || null, bill_date || new Date().toISOString().split('T')[0], Number(amount), description || null, connection_id || null, connection_record_id || null]
    );

      // Persist connection in utility connections table for easy reuse/search
      if (connection_id) {
        try {
          const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) as cnt FROM sarga_utility_connections WHERE branch_id = ? AND utility_type = ? AND connection_id = ?',
            [finalBranchId, utility_type, connection_id]
          );
          if (Number(cnt) === 0) {
            await pool.query(
              'INSERT INTO sarga_utility_connections (branch_id, utility_type, connection_id, label, created_at) VALUES (?, ?, ?, ?, NOW())',
              [finalBranchId, utility_type, connection_id, connection_id]
            );
          }
        } catch (connErr) {
          console.warn('Failed to upsert utility connection:', connErr.message);
        }
      }

    // SYNC WITH GLOBAL PAYMENTS TABLE (Assuming utility bill record is also a payment in this context)
    await pool.query(`
      INSERT INTO sarga_payments 
      (branch_id, type, payee_name, amount, payment_method, cash_amount, upi_amount, description, payment_date) 
      VALUES (?, 'Utility', ?, ?, 'Cash', ?, 0, ?, ?)
    `, [
      finalBranchId,
      utility_type,
      amount,
      amount,
      `Utility Bill Payment: ${utility_type}${description ? ' - ' + description : ''}`,
      bill_date || new Date()
    ]);

    auditLog(req.user.id, 'UTILITY_BILL', `Utility bill ₹${amount} for ${utility_type}`);
    res.status(201).json({ id: result.insertId, message: 'Utility bill recorded' });
  } catch (err) {
    console.error('Utility bill error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// List utility bills
router.get('/utility-bills', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { utility_type, branch_id } = req.query;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);

    let whereClauses = [];
    const params = [];

    if (utility_type) {
      whereClauses.push("ub.utility_type = ?");
      params.push(utility_type);
    }

    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      whereClauses.push("ub.branch_id = ?");
      params.push(req.user.branch_id);
    } else if (branch_id) {
      whereClauses.push("ub.branch_id = ?");
      params.push(branch_id);
    }

    const whereSection = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';

    const baseFrom = `
      FROM sarga_utility_bills ub 
      JOIN sarga_branches b ON ub.branch_id = b.id 
      WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT ub.*, b.name as branch_name 
      ${baseFrom}
      ORDER BY ub.bill_date DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json(response(rows, total));
  } catch (err) {
    console.error('Utility bills list error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// List utility bills for a specific connection (ledger-style, paginated)
router.get('/utility-bills/by-connection/:connectionId', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);
    const { start_date, end_date } = req.query;
    let whereClauses = ['ub.connection_record_id = ?'];
    const params = [connectionId];

    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      whereClauses.push('ub.branch_id = ?');
      params.push(req.user.branch_id);
    }
    if (start_date) { whereClauses.push('ub.bill_date >= ?'); params.push(start_date); }
    if (end_date) { whereClauses.push('ub.bill_date <= ?'); params.push(end_date); }

    const whereSection = ' AND ' + whereClauses.join(' AND ');
    const baseFrom = `FROM sarga_utility_bills ub JOIN sarga_branches b ON ub.branch_id = b.id WHERE 1=1 ${whereSection}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total ${baseFrom}`, params);
    const [rows] = await pool.query(`
      SELECT ub.*, b.name as branch_name
      ${baseFrom}
      ORDER BY ub.bill_date DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // Aggregate totals
    const totalBilled = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

    // Fetch connection details
    const [[connection]] = await pool.query('SELECT * FROM sarga_utility_connections WHERE id = ?', [connectionId]);

    res.json(response({
      rows,
      connection: connection || null,
      summary: { total_billed: totalBilled, bill_count: rows.length, total }
    }, total));
  } catch (err) {
    console.error('Connection bills error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// Delete a utility bill
router.delete('/utility-bills/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM sarga_utility_bills WHERE id = ?", [req.params.id]);
    const { auditLog } = require('../helpers');
    auditLog(req.user.id, 'UTILITY_BILL_DELETE', `Deleted utility bill ${req.params.id}`);
    res.json({ message: 'Utility bill deleted' });
  } catch (err) {
    console.error('Delete utility bill error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// --- Utility Connections CRUD ---
router.get('/utility-connections', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { utility_type, branch_id } = req.query;
    const params = [];
    let where = ' WHERE 1=1';

    if (!['Admin', 'Accountant'].includes(req.user.role)) {
      where += ' AND branch_id = ?';
      params.push(req.user.branch_id);
    } else if (branch_id) {
      where += ' AND branch_id = ?';
      params.push(branch_id);
    }

    if (utility_type) {
      where += ' AND utility_type = ?';
      params.push(utility_type);
    }

    const [rows] = await pool.query(`SELECT uc.*, b.name as branch_name FROM sarga_utility_connections uc JOIN sarga_branches b ON uc.branch_id = b.id ${where} ORDER BY uc.created_at DESC`, params);
    res.json({ rows });
  } catch (err) {
    console.error('Utility connections list error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

router.post('/utility-connections', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  const { utility_type, connection_id, label, provider, billing_cycle, branch_id, is_active } = req.body;
  const finalBranchId = ['Admin', 'Accountant'].includes(req.user.role) ? (branch_id || req.user.branch_id) : req.user.branch_id;
  if (!utility_type || !connection_id) return res.status(400).json({ message: 'utility_type and connection_id are required' });
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM sarga_utility_connections WHERE branch_id = ? AND utility_type = ? AND connection_id = ?', [finalBranchId, utility_type, connection_id]);
    if (Number(cnt) > 0) return res.status(409).json({ message: 'Connection already exists' });
    const finalIsActive = is_active !== undefined ? Number(is_active) : 1;
    const [result] = await pool.query('INSERT INTO sarga_utility_connections (branch_id, utility_type, connection_id, label, provider, billing_cycle, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)', [finalBranchId, utility_type, connection_id, label || null, provider || null, billing_cycle || 'monthly', finalIsActive]);
    auditLog(req.user.id, 'UTILITY_CONNECTION_ADD', `Added connection ${connection_id} for ${utility_type}`);
    res.status(201).json({ id: result.insertId, message: 'Connection added' });
  } catch (err) {
    console.error('Add utility connection error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// Update a utility connection
router.put('/utility-connections/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), async (req, res) => {
  const { label, provider, billing_cycle, is_active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (label !== undefined) { fields.push('label = ?'); params.push(label); }
    if (provider !== undefined) { fields.push('provider = ?'); params.push(provider); }
    if (billing_cycle !== undefined) { fields.push('billing_cycle = ?'); params.push(billing_cycle); }
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active); }
    if (fields.length === 0) return res.status(400).json({ message: 'No fields to update' });
    params.push(req.params.id);
    const [result] = await pool.query(`UPDATE sarga_utility_connections SET ${fields.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Connection not found' });
    auditLog(req.user.id, 'UTILITY_CONNECTION_UPDATE', `Updated connection ${req.params.id}`);
    res.json({ message: 'Connection updated' });
  } catch (err) {
    console.error('Update utility connection error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

router.delete('/utility-connections/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM sarga_utility_connections WHERE id = ?', [req.params.id]);
    auditLog(req.user.id, 'UTILITY_CONNECTION_DELETE', `Deleted utility connection ${req.params.id}`);
    res.json({ message: 'Connection deleted' });
  } catch (err) {
    console.error('Delete utility connection error:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

router.get('/reports/rent-statement', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = " WHERE p.type = 'Rent'";
    filter += buildBranchFilter('p', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, b.name as branch_name
       FROM sarga_payments p
       JOIN sarga_branches b ON p.branch_id = b.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Rent statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/emi-statement', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = ' WHERE 1=1';
    filter += buildBranchFilter('e', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, e.institution_name, e.emi_type
       FROM sarga_emi_payments p
       JOIN sarga_emi_master e ON p.emi_id = e.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('EMI statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/kuri-statement', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let filter = ' WHERE 1=1';
    filter += buildBranchFilter('k', req, params);
    filter += buildDateFilter('p.payment_date', start_date, end_date, params);

    const [rows] = await pool.query(
      `SELECT p.*, k.kuri_name
       FROM sarga_kuri_payments p
       JOIN sarga_kuri_master k ON p.kuri_id = k.id
       ${filter}
       ORDER BY p.payment_date DESC`,
      params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Kuri statement error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/cash-vs-bank', authenticateToken, authorizeRoles('Admin', 'Accountant', 'Front Office'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const unionA = buildExpenseUnionQuery(req, start_date, end_date);
    const [rows] = await pool.query(
      `SELECT 
         SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END) as cash_total,
         SUM(CASE WHEN payment_method = 'UPI' THEN amount ELSE 0 END) as upi_total,
         SUM(CASE WHEN payment_method IN ('Cheque', 'Account Transfer', 'Bank Transfer') THEN amount ELSE 0 END) as bank_total,
         SUM(CASE WHEN payment_method NOT IN ('Cash', 'UPI', 'Cheque', 'Account Transfer', 'Bank Transfer') THEN amount ELSE 0 END) as other_total
       FROM (${unionA.query}) x`,
      unionA.params
    );

    res.json({ rows });
  } catch (error) {
    console.error('Cash vs bank error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

