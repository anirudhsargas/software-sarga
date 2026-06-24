const { pool } = require('../database');
const logger = require('../helpers/logger');

const TTL = process.env.WEBSITE_CACHE_TTL_MS ? Number(process.env.WEBSITE_CACHE_TTL_MS) : 30_000;

// In-memory cache
const cache = {
  products: { ts: 0, data: [] },
  categories: { ts: 0, data: [] },
};

async function loadProducts() {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.description, p.image_url,
            sc.name AS subcategory_name,
            c.name AS category_name
     FROM sarga_products p
     JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
     JOIN sarga_product_categories c ON sc.category_id = c.id
     WHERE p.is_active = 1 AND sc.is_active = 1 AND c.is_active = 1
     ORDER BY c.position, sc.position, p.position
     LIMIT 100`
  );
  return rows;
}

async function loadCategories() {
  const [categories] = await pool.query(
    `SELECT id, name, image_url
     FROM sarga_product_categories
     WHERE is_active = 1
     ORDER BY position, name`
  );
  const [subcategories] = await pool.query(
    `SELECT sc.id, sc.category_id, sc.name, sc.image_url
     FROM sarga_product_subcategories sc
     JOIN sarga_product_categories c ON sc.category_id = c.id
     WHERE sc.is_active = 1 AND c.is_active = 1
     ORDER BY sc.position, sc.name`
  );
  const result = categories.map((cat) => ({
    ...cat,
    subcategories: subcategories.filter((sc) => sc.category_id === cat.id),
  }));
  return result;
}

async function getProducts() {
  try {
    if (Date.now() - cache.products.ts > TTL) {
      cache.products.data = await loadProducts();
      cache.products.ts = Date.now();
      logger.info('[WebsiteCache] Refreshed products cache');
    }
    return cache.products.data;
  } catch (err) {
    logger.warn('[WebsiteCache] Failed to load products:', err.message);
    return cache.products.data || [];
  }
}

async function getCategories() {
  try {
    if (Date.now() - cache.categories.ts > TTL) {
      cache.categories.data = await loadCategories();
      cache.categories.ts = Date.now();
      logger.info('[WebsiteCache] Refreshed categories cache');
    }
    return cache.categories.data;
  } catch (err) {
    logger.warn('[WebsiteCache] Failed to load categories:', err.message);
    return cache.categories.data || [];
  }
}

function invalidate(type) {
  if (!type) {
    cache.products.ts = 0;
    cache.categories.ts = 0;
    logger.info('[WebsiteCache] Invalidated all caches');
  } else {
    if (type === 'products') cache.products.ts = 0;
    if (type === 'categories') cache.categories.ts = 0;
    logger.info(`[WebsiteCache] Invalidated cache: ${type}`);
  }
}

module.exports = { getProducts, getCategories, invalidate };
