const { pool } = require('../database');
const logger = require('../helpers/logger');

const TTL = process.env.WEBSITE_CACHE_TTL_MS ? Number(process.env.WEBSITE_CACHE_TTL_MS) : 30_000;

// In-memory fallback cache
const cache = {
  products: { ts: 0, data: [] },
  categories: { ts: 0, data: [] },
};

// Try to initialize Redis (ioredis) when REDIS_URL is provided. If not available,
// we'll continue using the in-memory cache. Redis is optional but recommended for
// multi-instance deployments so invalidation can be propagated across instances.
let redis = null;
let redisPub = null;
let redisSub = null;
const REDIS_CHANNEL = 'website-cache-invalidate';

if (process.env.REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redis = new IORedis(process.env.REDIS_URL);
    // Create separate pub/sub clients to avoid interference
    redisPub = new IORedis(process.env.REDIS_URL);
    redisSub = new IORedis(process.env.REDIS_URL);

    redisSub.subscribe(REDIS_CHANNEL, (err) => {
      if (err) logger.warn('[WebsiteCache] Failed to subscribe to Redis channel:', err.message);
      else logger.info('[WebsiteCache] Subscribed to Redis invalidation channel');
    });

    redisSub.on('message', (channel, message) => {
      if (channel !== REDIS_CHANNEL) return;
      try {
        const type = message || null;
        if (!type) {
          cache.products.ts = 0;
          cache.categories.ts = 0;
        } else {
          if (type === 'products') cache.products.ts = 0;
          if (type === 'categories') cache.categories.ts = 0;
        }
        logger.info('[WebsiteCache] Received invalidation message from Redis:', type || 'all');
      } catch (e) {
        logger.warn('[WebsiteCache] Error processing invalidation message:', e.message);
      }
    });
  } catch (e) {
    logger.warn('[WebsiteCache] ioredis not available or failed to initialize, using in-memory cache');
    redis = null;
  }
}

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
    // If redis is configured, attempt to read from redis first
    if (redis) {
      const key = 'website:products';
      const raw = await redis.get(key);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* fallthrough */ }
      }
      const rows = await loadProducts();
      try { await redis.set(key, JSON.stringify(rows), 'PX', TTL); } catch (e) { logger.warn('[WebsiteCache] Failed to write products to redis:', e.message); }
      return rows;
    }

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
    if (redis) {
      const key = 'website:categories';
      const raw = await redis.get(key);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* fallthrough */ }
      }
      const rows = await loadCategories();
      try { await redis.set(key, JSON.stringify(rows), 'PX', TTL); } catch (e) { logger.warn('[WebsiteCache] Failed to write categories to redis:', e.message); }
      return rows;
    }

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

  // Remove keys from Redis and publish invalidation so other instances pick it up
  if (redis && redisPub) {
    try {
      const delKey = (k) => redis.del(k).catch(() => {});
      if (!type) {
        delKey('website:products');
        delKey('website:categories');
      } else if (type === 'products') delKey('website:products');
      else if (type === 'categories') delKey('website:categories');

      redisPub.publish(REDIS_CHANNEL, type || '');
    } catch (e) {
      logger.warn('[WebsiteCache] Failed to publish invalidation to Redis:', e.message);
    }
  }
}

module.exports = { getProducts, getCategories, invalidate };
