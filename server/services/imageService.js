const { pool } = require('../database');
const axios = require('axios');

// Placeholder for image matching logic using a placeholder service since no specific API was provided
async function findImageMatch(productName, subcategory, category) {
  // Construct search string
  const searchString = `${productName || ''} ${subcategory || ''} ${category || ''}`.trim();
  
  if (!searchString) return { url: null, confidence: 0 };

  // For demonstration/fallback, we will use Unsplash Source API or similar placeholder.
  // We simulate confidence logic.
  // Real implementation could use SerpApi, Google Custom Search, or Gemini.
  const encodedSearch = encodeURIComponent(searchString);
  const placeholderUrl = `https://ui-avatars.com/api/?name=${encodedSearch}&background=random&size=300`;
  
  // Return the mock match with high confidence to trigger auto-save
  return {
    url: placeholderUrl,
    confidence: 95
  };
}

async function getInventoryImageSettings() {
  try {
    const [rows] = await pool.query('SELECT * FROM sarga_inventory_settings WHERE id = 1');
    if (rows.length > 0) return rows[0];
  } catch (e) {
    console.error('Error fetching inventory settings:', e);
  }
  return {
    auto_assign_images: 1,
    cache_images: 1,
    generate_missing: 1,
    category_placeholders: 1,
    ask_before_saving: 1,
    image_quality: 'Medium'
  };
}

async function resolveInventoryImage(inventoryItem) {
  const settings = await getInventoryImageSettings();
  
  // 1. Check Cache / Uploaded
  const [cacheRows] = await pool.query('SELECT * FROM sarga_product_images WHERE inventory_item_id = ? LIMIT 1', [inventoryItem.id]);
  
  if (cacheRows.length > 0) {
    const cache = cacheRows[0];
    return {
      image_url: cache.image_url,
      source: cache.source,
      confidence: cache.confidence,
      is_locked: cache.is_locked
    };
  }

  // 2. Generate/Find Match if enabled
  if (settings.auto_assign_images && settings.generate_missing) {
    try {
      const match = await findImageMatch(inventoryItem.name, inventoryItem.product_subcategory_name, inventoryItem.category);
      
      if (match && match.url && match.confidence >= 70) {
        let source = 'Generated';
        let finalConfidence = match.confidence;
        
        // Auto-save if confidence > 90, otherwise it might just be suggested (we can save it as 'Generated' but maybe need confirmation)
        if (settings.cache_images) {
          await pool.query(
            `INSERT INTO sarga_product_images (inventory_item_id, image_url, source, confidence, is_locked)
             VALUES (?, ?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), source = VALUES(source), confidence = VALUES(confidence)`,
            [inventoryItem.id, match.url, source, finalConfidence]
          );
        }
        
        return {
          image_url: match.url,
          source: source,
          confidence: finalConfidence,
          is_locked: 0
        };
      }
    } catch (err) {
      console.error('Image match error for item', inventoryItem.id, err.message);
    }
  }

  // 3. Category Fallback
  return {
    image_url: null,
    source: 'Default',
    confidence: 0,
    is_locked: 0
  };
}

module.exports = {
  findImageMatch,
  getInventoryImageSettings,
  resolveInventoryImage
};
