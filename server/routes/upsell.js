// Upsell suggestions API
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// Simple association rule mining (frequent itemsets)
async function getUpsellSuggestions(productNames, limit = 3) {
  // Find orders containing the given product(s)
  // and return other items frequently bought together
  // (This is a naive implementation; for production, use a proper ML library)
  try {
    const [rows] = await pool.query(
      `SELECT order_lines FROM sarga_customer_payments WHERE order_lines IS NOT NULL AND order_lines != '[]' LIMIT 1000`
    );
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    
    const itemCounts = {};
    const coOccur = {};
    
    for (const row of rows) {
      if (!row || !row.order_lines) continue;
      
      let lines;
      try { 
        lines = typeof row.order_lines === 'string' ? JSON.parse(row.order_lines) : row.order_lines;
      } catch (parseErr) {
        console.warn('[UpsellSuggestions] Failed to parse order_lines JSON:', parseErr.message);
        continue;
      }
      
      if (!Array.isArray(lines)) continue;
      
      const names = lines.map(l => l.product_name || l.name).filter(Boolean);
      
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
  } catch (err) {
    console.error('[UpsellSuggestions] Error in getUpsellSuggestions:', {
      error: err.message,
      stack: err.stack,
      productNames
    });
    throw err;
  }
}

// POST /api/upsell-suggestions { products: ["Wedding Card"] }
router.post('/upsell-suggestions', authenticateToken, async (req, res) => {
  try {
    // Validate request body
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is required' });
    }
    
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Missing or empty products array in request body' });
    }
    
    // Validate that all products are strings
    if (!products.every(p => typeof p === 'string' && p.trim().length > 0)) {
      return res.status(400).json({ error: 'All products must be non-empty strings' });
    }
    
    const suggestions = await getUpsellSuggestions(products);
    res.json({ suggestions });
  } catch (err) {
    console.error('[UpsellSuggestions] POST /upsell-suggestions error:', {
      error: err.message,
      stack: err.stack,
      body: req.body,
      products: req.body?.products
    });
    res.status(500).json({ error: 'Failed to generate upsell suggestions', details: err.message });
  }
});

module.exports = router;
