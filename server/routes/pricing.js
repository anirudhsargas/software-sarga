const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger'); // eslint-disable-line no-unused-vars
const { invalidatePattern } = require('../services/cacheService');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const invalidateCache = (pattern) => invalidatePattern(pattern).catch(() => {});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function calculateGST(amount, rate) {
  const gst = amount * (rate / 100);
  return { gst, total: amount + gst };
}

function roundTo(n, places = 2) {
  return Number(Number(n).toFixed(places));
}

// GET /api/pricing/products - List products & finishes for pricing calculator
router.get('/pricing/products', asyncHandler(async (req, res) => {
  const [products] = await pool.query(
    `SELECT p.id, p.name, p.size, p.calculation_type, p.description, p.image_url,
            p.has_paper_rate, p.paper_rate, p.has_double_side_rate,
            sc.name AS subcategory_name, c.name AS category_name
     FROM sarga_products p
     JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
     JOIN sarga_product_categories c ON sc.category_id = c.id
     WHERE p.is_active = 1 AND sc.is_active = 1 AND c.is_active = 1
     ORDER BY c.position, sc.position, p.position`
  );

  const productIds = products.map(p => p.id);
  if (productIds.length === 0) return res.json({ products: [], finishes: [] });

  const [finishes] = await pool.query(
    'SELECT * FROM product_finishes WHERE is_active = 1 ORDER BY category, position'
  );

  const [mappings] = await pool.query(
    'SELECT * FROM product_finish_mapping WHERE product_id IN (?)',
    [productIds]
  );

  const [tiers] = await pool.query(
    `SELECT pt.* FROM pricing_tiers pt WHERE pt.product_id IN (?) AND pt.is_active = 1 ORDER BY pt.product_id, pt.min_qty`,
    [productIds]
  );

  const [rules] = await pool.query(
    `SELECT pr.* FROM pricing_rules pr WHERE pr.product_id IN (?) AND pr.is_active = 1`,
    [productIds]
  );

  // Attach data to products
  const productsMap = {};
  products.forEach(p => {
    p.tiers = [];
    p.rules = [];
    p.finishes = [];
    p.slabs = [];
    productsMap[p.id] = p;
  });

  tiers.forEach(t => {
    if (productsMap[t.product_id]) productsMap[t.product_id].tiers.push(t);
  });

  rules.forEach(r => {
    if (productsMap[r.product_id]) productsMap[r.product_id].rules.push(r);
  });

  mappings.forEach(m => {
    if (productsMap[m.product_id] && finishes.find(f => f.id === m.finish_id)) {
      productsMap[m.product_id].finishes.push(finishes.find(f => f.id === m.finish_id));
    }
  });

  // Also get existing slab data from the legacy system
  const [slabs] = await pool.query(
    'SELECT id, product_id, min_qty, max_qty, unit_rate, base_value, double_side_unit_rate FROM sarga_product_slabs ORDER BY product_id, min_qty ASC'
  );
  slabs.forEach(s => {
    if (productsMap[s.product_id]) productsMap[s.product_id].slabs.push(s);
  });

  res.json({ products: Object.values(productsMap), finishes });
}));

// GET /api/pricing/calculate - Calculate price dynamically
router.get('/pricing/calculate', asyncHandler(async (req, res) => {
  const {
    product_id, quantity, size, gsm, paper_type,
    color_count, finish_ids, branch_id: _branch_id
  } = req.query;

  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'product_id and quantity required' });
  }

  const qty = parseInt(quantity) || 1;
  const finishList = finish_ids ? String(finish_ids).split(',').map(Number).filter(Boolean) : [];

  const [[product]] = await pool.query(
    `SELECT p.*, sc.name AS subcategory_name, c.name AS category_name
     FROM sarga_products p
     JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
     JOIN sarga_product_categories c ON sc.category_id = c.id
     WHERE p.id = ?`,
    [product_id]
  );
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // 1. Check pricing_rules first (most specific)
  let unitPrice = 0;
  let setupFee = 0;
  let gstRate = 18.00;
  let priceSource = 'default';

  const ruleParams = [product_id];
  const ruleWhere = ['product_id = ?'];
  if (size) { ruleWhere.push('size_name = ?'); ruleParams.push(size); }
  if (gsm) { ruleWhere.push('gsm = ?'); ruleParams.push(gsm); }
  if (paper_type) { ruleWhere.push('paper_type = ?'); ruleParams.push(paper_type); }
  if (color_count) { ruleWhere.push('color_count <= ?'); ruleParams.push(color_count); }

  const [matchingRules] = await pool.query(
    `SELECT * FROM pricing_rules WHERE ${ruleWhere.join(' AND ')} AND is_active = 1 ORDER BY base_price ASC LIMIT 1`,
    ruleParams
  );

  if (matchingRules.length > 0) {
    const rule = matchingRules[0];
    unitPrice = Number(rule.base_price);
    setupFee = Number(rule.setup_fee);
    priceSource = 'rule';
  } else {
    // 2. Check pricing_tiers
    const [matchingTiers] = await pool.query(
      `SELECT * FROM pricing_tiers WHERE product_id = ? AND min_qty <= ? AND (max_qty IS NULL OR max_qty >= ?) AND is_active = 1 ORDER BY min_qty ASC LIMIT 1`,
      [product_id, qty, qty]
    );

    if (matchingTiers.length > 0) {
      unitPrice = Number(matchingTiers[0].unit_price);
      setupFee = Number(matchingTiers[0].setup_fee);
      gstRate = Number(matchingTiers[0].gst_rate);
      priceSource = 'tier';
    } else {
      // 3. Fall back to legacy slab system (improved: support Normal/Range/Slab interpolation,
      //    paper-rate add-on and double-side/offset rates)
      const [slabs] = await pool.query(
        'SELECT id, product_id, min_qty, max_qty, unit_rate, base_value, offset_unit_rate, double_side_unit_rate FROM sarga_product_slabs WHERE product_id = ? ORDER BY min_qty ASC',
        [product_id]
      );

      if (slabs.length > 0) {
        // Support optional query flags from frontend
        const isDoubleSide = req.query.is_double_side === '1' || req.query.is_double_side === 'true' || req.query.is_double_side === true;
        const isOffset = req.query.is_offset === '1' || req.query.is_offset === 'true' || req.query.is_offset === true;
        const paperRateOverride = (req.query.paper_rate !== undefined && req.query.paper_rate !== null) ? Number(req.query.paper_rate) : undefined;

        const resolveUnitRate = (slab) => {
          if (!slab) return 0;
          if (isDoubleSide && slab.double_side_unit_rate != null) return Number(slab.double_side_unit_rate) || 0;
          if (isOffset && slab.offset_unit_rate != null) return Number(slab.offset_unit_rate) || 0;
          return Number(slab.unit_rate) || 0;
        };

        if (product.calculation_type === 'Normal') {
          const first = slabs[0];
          unitPrice = resolveUnitRate(first);
          setupFee = 0;
        } else if (product.calculation_type === 'Range') {
          const matched = slabs.find(s => {
            const maxQty = s.max_qty == null ? Infinity : Number(s.max_qty);
            return qty >= Number(s.min_qty) && qty <= maxQty;
          }) || slabs[slabs.length - 1];
          unitPrice = resolveUnitRate(matched);
          setupFee = 0;
        } else if (product.calculation_type === 'Slab') {
          const sorted = [...slabs].sort((a, b) => Number(a.min_qty) - Number(b.min_qty));
          let totalFromSlabs = 0;
          // Track the effective slab for add-on rates (double-side, offset)
          let effectiveSlabForAddons = sorted[0];

          if (sorted.length > 0) {
            const exactMatch = sorted.find(s => Number(s.min_qty) === qty);
            if (exactMatch) {
              totalFromSlabs = Number(exactMatch.base_value) || (resolveUnitRate(exactMatch) * qty);
              effectiveSlabForAddons = exactMatch;
            } else if (qty < Number(sorted[0].min_qty)) {
              totalFromSlabs = Number(sorted[0].base_value) || (resolveUnitRate(sorted[0]) * qty);
              effectiveSlabForAddons = sorted[0];
            } else if (qty > Number(sorted[sorted.length - 1].min_qty)) {
              const last = sorted[sorted.length - 1];
              // Use the slab's unit_rate directly for quantities beyond the last slab.
              // Deriving from base_value/min_qty was wrong when qty >> min_qty.
              const lastUnit = resolveUnitRate(last);
              totalFromSlabs = lastUnit * qty;
              effectiveSlabForAddons = last;
            } else {
              for (let i = 0; i < sorted.length - 1; i++) {
                const s1 = sorted[i];
                const s2 = sorted[i + 1];
                if (qty > Number(s1.min_qty) && qty < Number(s2.min_qty)) {
                  const ratio = (qty - Number(s1.min_qty)) / (Number(s2.min_qty) - Number(s1.min_qty));
                  totalFromSlabs = Number(s1.base_value) + ratio * (Number(s2.base_value) - Number(s1.base_value));
                  effectiveSlabForAddons = s1; // use lower-bound slab for add-on rates
                  break;
                }
              }
            }
          }

          unitPrice = qty > 0 ? (Number(totalFromSlabs) || 0) / qty : 0;
          setupFee = 0;

          // Paper rate add-on (if product stores a paper_rate or override provided)
          const effectivePaperRate = paperRateOverride !== undefined ? paperRateOverride : (product.paper_rate ? Number(product.paper_rate) : 0);
          if (product.has_paper_rate) {
            totalFromSlabs += effectivePaperRate * qty;
            unitPrice = qty > 0 ? totalFromSlabs / qty : 0;
          }

          // Bug 1 fix: use effective slab's double_side_unit_rate, not sorted[0]
          // Bug 3 fix: apply offset_unit_rate as an add-on for Slab-type offset customers
          if (product.has_double_side_rate && isDoubleSide) {
            const dsRate = Number(effectiveSlabForAddons?.double_side_unit_rate) || 0;
            if (dsRate > 0) {
              totalFromSlabs += dsRate * qty;
              unitPrice = qty > 0 ? totalFromSlabs / qty : 0;
            }
          } else if (isOffset) {
            const offsetRate = Number(effectiveSlabForAddons?.offset_unit_rate) || 0;
            if (offsetRate > 0) {
              totalFromSlabs += offsetRate * qty;
              unitPrice = qty > 0 ? totalFromSlabs / qty : 0;
            }
          }

          // Ensure subtotal will be computed correctly later from unitPrice
        }

        priceSource = 'slab';
      } else {
        // 4. Last resort default
        unitPrice = 10;
        setupFee = 0;
      }
    }
  }

  // 5. Apply finishes
  let finishesTotal = 0;
  let finishDetails = [];
  if (finishList.length > 0) {
    const [finishes] = await pool.query('SELECT * FROM product_finishes WHERE id IN (?) AND is_active = 1', [finishList]);
    finishes.forEach(f => {
      let cost = Number(f.unit_price);
      if (f.price_type === 'per_unit') cost *= qty;
      else if (f.price_type === 'per_sqinch') {
        const w = size ? 4 : 4; const h = size ? 6 : 6;
        cost *= (w * h * qty);
      }
      finishesTotal += cost;
      finishDetails.push({ id: f.id, name: f.name, cost: roundTo(cost) });
    });
  }

  // 6. Calculate totals
  const subtotal = qty * unitPrice;
  const totalBeforeGST = subtotal + setupFee + finishesTotal;
  const { gst, total: afterGST } = calculateGST(totalBeforeGST, gstRate);

  res.json({
    product_id: Number(product_id),
    product_name: product.name,
    quantity: qty,
    unit_price: roundTo(unitPrice),
    setup_fee: roundTo(setupFee),
    finishes: finishDetails,
    finishes_total: roundTo(finishesTotal),
    subtotal: roundTo(subtotal),
    total_before_gst: roundTo(totalBeforeGST),
    gst_rate: gstRate,
    gst_amount: roundTo(gst),
    total: roundTo(afterGST),
    price_source: priceSource,
    gst_breakdown: {
      cgst: roundTo(gst / 2, 2),
      sgst: roundTo(gst / 2, 2),
    }
  });
}));

// GET /api/pricing/finishes - List all finishes
router.get('/pricing/finishes', asyncHandler(async (req, res) => {
  const [finishes] = await pool.query('SELECT * FROM product_finishes WHERE is_active = 1 ORDER BY category, position');
  const grouped = {};
  finishes.forEach(f => {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  });
  res.json({ finishes, grouped });
}));

// GET /api/pricing/product/:id/finishes - Finishes available for a product
router.get('/pricing/product/:id/finishes', asyncHandler(async (req, res) => {
  const [mappings] = await pool.query(
    `SELECT pf.* FROM product_finish_mapping pfm
     JOIN product_finishes pf ON pfm.finish_id = pf.id
     WHERE pfm.product_id = ? AND pf.is_active = 1
     ORDER BY pf.category, pf.position`,
    [req.params.id]
  );
  res.json({ finishes: mappings });
}));

// GET /api/pricing/express - Check express production eligibility
router.get('/pricing/express', asyncHandler(async (req, res) => {
  const { product_id, product_category, quantity } = req.query;
  if (!product_id && !product_category) {
    return res.status(400).json({ error: 'product_id or product_category required' });
  }

  let rules;
  if (product_id) {
    [rules] = await pool.query(
      `SELECT epr.*, p.name AS product_name, sc.name AS category_name
       FROM express_production_rules epr
       LEFT JOIN sarga_products p ON epr.product_id = p.id
       LEFT JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
       WHERE epr.product_id = ? AND epr.is_active = 1`,
      [product_id]
    );
  }
  if ((!rules || rules.length === 0) && product_category) {
    [rules] = await pool.query(
      'SELECT * FROM express_production_rules WHERE product_category = ? AND is_active = 1 LIMIT 1',
      [product_category]
    );
  }

  const qty = parseInt(quantity) || 1;
  const result = {
    eligible_3hr: false,
    eligible_today: false,
    eligible_tomorrow: false,
    labels: []
  };

  if (rules && rules.length > 0) {
    const rule = rules[0];
    result.eligible_3hr = rule.turnaround_3hr && qty <= rule.max_qty_3hr;
    result.eligible_today = rule.turnaround_today && qty <= rule.max_qty_today;
    result.eligible_tomorrow = rule.turnaround_tomorrow && qty <= rule.max_qty_tomorrow;

    const now = new Date();
    const hr = now.getHours();
    if (result.eligible_3hr && hr < 14) result.labels.push('Ready in 3 Hours');
    if (result.eligible_today && hr < 17) result.labels.push('Ready Today');
    if (result.eligible_tomorrow) result.labels.push('Ready Tomorrow');
  }

  res.json(result);
}));

// ─── ADMIN: Pricing Rules CRUD ───
router.get('/pricing/admin/finishes', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM product_finishes ORDER BY category, position');
  res.json({ finishes: rows });
}));

router.post('/pricing/admin/finishes', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { name, category, description, unit_price, price_type } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });
  const [result] = await pool.query(
    'INSERT INTO product_finishes (name, category, description, unit_price, price_type) VALUES (?, ?, ?, ?, ?)',
    [name, category, description || null, unit_price || 0, price_type || 'per_unit']
  );
  invalidateCache('/api/pricing');
  res.status(201).json({ id: result.insertId, message: 'Finish created' });
}));

router.put('/pricing/admin/finishes/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { name, category, description, unit_price, price_type, is_active } = req.body;
  const sets = []; const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (category !== undefined) { sets.push('category = ?'); params.push(category); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (unit_price !== undefined) { sets.push('unit_price = ?'); params.push(unit_price); }
  if (price_type !== undefined) { sets.push('price_type = ?'); params.push(price_type); }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields' });
  params.push(req.params.id);
  await pool.query(`UPDATE product_finishes SET ${sets.join(', ')} WHERE id = ?`, params);
  invalidateCache('/api/pricing');
  res.json({ message: 'Finish updated' });
}));

router.delete('/pricing/admin/finishes/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM product_finishes WHERE id = ?', [req.params.id]);
  invalidateCache('/api/pricing');
  res.json({ message: 'Finish deleted' });
}));

// Admin: Pricing Tiers CRUD
router.get('/pricing/admin/tiers/:product_id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM pricing_tiers WHERE product_id = ? ORDER BY min_qty',
    [req.params.product_id]
  );
  res.json({ tiers: rows });
}));

router.post('/pricing/admin/tiers', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { product_id, min_qty, max_qty, unit_price, setup_fee, gst_rate } = req.body;
  if (!product_id || min_qty === undefined || unit_price === undefined) {
    return res.status(400).json({ error: 'product_id, min_qty, unit_price required' });
  }
  const [result] = await pool.query(
    'INSERT INTO pricing_tiers (product_id, min_qty, max_qty, unit_price, setup_fee, gst_rate) VALUES (?, ?, ?, ?, ?, ?)',
    [product_id, min_qty, max_qty || null, unit_price, setup_fee || 0, gst_rate || 18.00]
  );
  invalidateCache('/api/pricing');
  res.status(201).json({ id: result.insertId, message: 'Tier created' });
}));

router.put('/pricing/admin/tiers/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const { min_qty, max_qty, unit_price, setup_fee, gst_rate } = req.body;
  const sets = []; const params = [];
  if (min_qty !== undefined) { sets.push('min_qty = ?'); params.push(min_qty); }
  if (max_qty !== undefined) { sets.push('max_qty = ?'); params.push(max_qty); }
  if (unit_price !== undefined) { sets.push('unit_price = ?'); params.push(unit_price); }
  if (setup_fee !== undefined) { sets.push('setup_fee = ?'); params.push(setup_fee); }
  if (gst_rate !== undefined) { sets.push('gst_rate = ?'); params.push(gst_rate); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields' });
  params.push(req.params.id);
  await pool.query(`UPDATE pricing_tiers SET ${sets.join(', ')} WHERE id = ?`, params);
  invalidateCache('/api/pricing');
  res.json({ message: 'Tier updated' });
}));

router.delete('/pricing/admin/tiers/:id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM pricing_tiers WHERE id = ?', [req.params.id]);
  invalidateCache('/api/pricing');
  res.json({ message: 'Tier deleted' });
}));

// Admin: Pricing Rules CRUD
router.get('/pricing/admin/rules/:product_id', authenticateToken, authorizeRoles('Admin', 'Accountant'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM pricing_rules WHERE product_id = ? ORDER BY size_name, gsm',
    [req.params.product_id]
  );
  res.json({ rules: rows });
}));

module.exports = router;
