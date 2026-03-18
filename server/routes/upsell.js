// Upsell suggestions API
const express = require('express');
const router = express.Router();
const db = require('../database');

// Simple association rule mining (frequent itemsets)
async function getUpsellSuggestions(productNames, limit = 3) {
  // Find orders containing the given product(s)
  // and return other items frequently bought together
  // (This is a naive implementation; for production, use a proper ML library)
  const [rows] = await db.query(
    `SELECT order_lines FROM sarga_customer_payments WHERE order_lines IS NOT NULL AND order_lines != '[]'`
  );
  const itemCounts = {};
  const coOccur = {};
  for (const row of rows) {
    let lines;
    try { lines = JSON.parse(row.order_lines); } catch { continue; }
    const names = (lines || []).map(l => l.product_name || l.name).filter(Boolean);
    for (const name of names) {
      itemCounts[name] = (itemCounts[name] || 0) + 1;
    }
    if (productNames.some(p => names.includes(p))) {
      for (const name of names) {
        if (!productNames.includes(name)) {
          coOccur[name] = (coOccur[name] || 0) + 1;
        }
      }
    }
  }
  // Sort by co-occurrence count, then by overall frequency
  const suggestions = Object.entries(coOccur)
    .sort((a, b) => b[1] - a[1] || (itemCounts[b[0]]||0) - (itemCounts[a[0]]||0))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count, total: itemCounts[name] }));
  return suggestions;
}

// POST /api/upsell-suggestions { products: ["Wedding Card"] }
router.post('/upsell-suggestions', async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Missing products array' });
  }
  try {
    const suggestions = await getUpsellSuggestions(products);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
