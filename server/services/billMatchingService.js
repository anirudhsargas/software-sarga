const { pool } = require('../database');
const logger = require('../helpers/logger');

function normalize(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeCode(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
}

function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  a = normalize(a);
  b = normalize(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.substring(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.substring(i, i + 2);
    const count = bigrams.get(bg) || 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

const NAME_FUZZY_THRESHOLD = 0.6;
const PRODUCT_FUZZY_THRESHOLD = 0.5;
const SUGGESTION_LIMIT = 5;
const SUGGESTION_MIN_SCORE = 0.15;
const VENDOR_SUGGESTION_MIN_SCORE = 0.1;

async function matchVendor(vendorName, gstNumber) {
  const suggestions = [];

  if (gstNumber && normalize(gstNumber)) {
    const [rows] = await pool.query(
      'SELECT id, name, gst_number FROM vendors WHERE gst_number = ? AND (is_active = 1 OR is_active IS NULL) LIMIT 1',
      [gstNumber.trim()]
    );
    if (rows.length > 0) {
      logger.info('[BillMatching] Vendor matched by GST', {
        vendorId: rows[0].id,
        vendorName: rows[0].name,
        gst: gstNumber,
      });
      return {
        matched: true,
        vendor_id: rows[0].id,
        vendor_name: rows[0].name,
        match_type: 'gst',
        confidence: 0.95,
        suggestions,
      };
    }
    logger.info('[BillMatching] No vendor matched by GST', { gst: gstNumber });
  }

  if (vendorName) {
    const normalizedInput = normalize(vendorName);
    const [vendors] = await pool.query(
      'SELECT id, name FROM vendors WHERE is_active = 1 OR is_active IS NULL'
    );

    let bestMatch = null;
    let bestScore = 0;
    const candidates = [];

    for (const v of vendors) {
      const normalizedDb = normalize(v.name);
      const score = diceCoefficient(normalizedInput, normalizedDb);
      const substringBonus =
        normalizedDb.includes(normalizedInput) ||
        normalizedInput.includes(normalizedDb)
          ? 0.1
          : 0;
      const combined = Math.min(score + substringBonus, 1);

      if (combined >= VENDOR_SUGGESTION_MIN_SCORE) {
        candidates.push({ vendor: v, score: combined });
      }

      if (combined > bestScore) {
        bestScore = combined;
        bestMatch = v;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    for (const c of candidates) {
      suggestions.push({
        vendor_id: c.vendor.id,
        vendor_name: c.vendor.name,
        confidence: Math.round(c.score * 100) / 100,
      });
    }

    if (bestMatch && bestScore >= NAME_FUZZY_THRESHOLD) {
      logger.info('[BillMatching] Vendor matched by fuzzy name', {
        vendorId: bestMatch.id,
        vendorName: bestMatch.name,
        score: bestScore,
        inputName: vendorName,
      });
      return {
        matched: true,
        vendor_id: bestMatch.id,
        vendor_name: bestMatch.name,
        match_type: 'name_fuzzy',
        confidence: Math.round(bestScore * 100) / 100,
        suggestions,
      };
    }

    logger.info('[BillMatching] No vendor matched by name', { vendorName });
  }

  return {
    matched: false,
    vendor_id: null,
    vendor_name: null,
    match_type: 'none',
    confidence: 0,
    suggestions,
  };
}

function computeProductScore(desc, codeDesc, known) {
  let bestScore = 0;

  for (const name of known.names) {
    if (desc === name) return { score: 0.95, type: 'exact_name' };
    const s = diceCoefficient(desc, name);
    if (s > bestScore) bestScore = s;
  }

  for (const code of known.codes) {
    if (code.length > 0 && codeDesc === code) return { score: 0.9, type: 'exact_code' };
    if (code.length >= 3) {
      const s = diceCoefficient(codeDesc, code);
      if (s > bestScore) bestScore = s;
    }
  }

  return { score: bestScore, type: 'fuzzy' };
}

async function matchProducts(items, vendorId, canonicalVendorName) {
  if (!items || items.length === 0) return [];

  const [inventoryRows] = await pool.query(
    `SELECT i.id AS inventory_id, i.name AS inventory_name, i.sku,
            i.sell_price,
            COALESCE(i.mrp, i.sell_price, 0) AS mrp,
            p.id AS product_id, p.name AS product_name, p.product_code
     FROM sarga_inventory i
     LEFT JOIN sarga_products p ON p.inventory_item_id = i.id`
  );

  const [orphanProducts] = await pool.query(
    `SELECT id, name, product_code FROM sarga_products
     WHERE inventory_item_id IS NULL`
  );

  const knownProducts = [];

  for (const inv of inventoryRows) {
    const names = [];
    const codes = [];

    if (inv.inventory_name) {
      names.push(normalize(inv.inventory_name));
      codes.push(normalizeCode(inv.inventory_name));
    }
    if (inv.sku) {
      names.push(normalize(inv.sku));
      codes.push(normalizeCode(inv.sku));
    }
    if (inv.product_name) {
      names.push(normalize(inv.product_name));
      codes.push(normalizeCode(inv.product_name));
    }
    if (inv.product_code) {
      names.push(normalize(inv.product_code));
      codes.push(normalizeCode(inv.product_code));
    }

    knownProducts.push({
      product_id: inv.product_id || inv.inventory_id,
      product_name: inv.product_name || inv.inventory_name,
      mrp: Number(inv.mrp) || Number(inv.sell_price) || 0,
      names: [...new Set(names)],
      codes: [...new Set(codes)],
    });
  }

  for (const prod of orphanProducts) {
    const names = [normalize(prod.name)];
    const codes = [normalizeCode(prod.name)];
    if (prod.product_code) {
      names.push(normalize(prod.product_code));
      codes.push(normalizeCode(prod.product_code));
    }
    knownProducts.push({
      product_id: prod.id,
      product_name: prod.name,
      mrp: 0,
      names,
      codes,
    });
  }

  const results = items.map(item => {
    const desc = item.description || '';
    const normalizedDesc = normalize(desc);
    const codeDesc = normalizeCode(desc);

    const candidates = [];
    for (const known of knownProducts) {
      const { score } = computeProductScore(normalizedDesc, codeDesc, known);
      if (score >= SUGGESTION_MIN_SCORE) {
        candidates.push({ known, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, SUGGESTION_LIMIT);

    const suggestions = topCandidates.map(c => ({
      product_id: c.known.product_id,
      product_name: c.known.product_name,
      mrp: c.known.mrp,
      confidence: Math.round(c.score * 100) / 100,
    }));

    const bestCandidate = candidates[0];
    const isMatched = bestCandidate && bestCandidate.score >= PRODUCT_FUZZY_THRESHOLD;

    return {
      original_description: desc,
      matched: isMatched,
      matched_product_id: isMatched ? bestCandidate.known.product_id : null,
      canonical_product_name: isMatched ? bestCandidate.known.product_name : null,
      mrp: isMatched ? bestCandidate.known.mrp : (suggestions[0]?.mrp || 0),
      confidence: isMatched ? Math.round(bestCandidate.score * 100) / 100 : 0,
      suggestions,
    };
  });

  const matchedCount = results.filter(r => r.matched).length;
  logger.info('[BillMatching] Product matching complete', {
    totalItems: items.length,
    matchedItems: matchedCount,
    totalSuggestions: results.reduce((sum, r) => sum + r.suggestions.length, 0),
  });

  return results;
}

async function matchVendorAndProducts(extractedData) {
  const { vendor_name, gst_number, items = [] } = extractedData || {};

  const vendorMatch = await matchVendor(vendor_name, gst_number);

  let itemMatches = await matchProducts(items, vendorMatch.vendor_id, vendorMatch.vendor_name);

  logger.info('[BillMatching] Complete', {
    vendorMatched: vendorMatch.matched,
    vendorMatchType: vendorMatch.match_type,
    vendorConfidence: vendorMatch.confidence,
    totalItems: items.length,
    matchedItems: itemMatches.filter(i => i.matched).length,
  });

  return { vendorMatch, itemMatches };
}

module.exports = { matchVendorAndProducts };
