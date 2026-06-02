const { pool } = require('../database');
const logger = require('../helpers/logger');
const { getCloudinaryUrl } = require('../helpers/cloudinaryUpload');

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
          p.calculation_type, p.has_paper_rate, p.paper_rate, p.has_double_side_rate,
          sc.name AS subcategory_name,
          c.name AS category_name,
          COALESCE(p.paper_rate, (SELECT MIN(unit_rate) FROM sarga_product_slabs sps WHERE sps.product_id = p.id AND sps.unit_rate IS NOT NULL), 0) AS starting_price
     FROM sarga_products p
     JOIN sarga_product_subcategories sc ON p.subcategory_id = sc.id
     JOIN sarga_product_categories c ON sc.category_id = c.id
     WHERE p.is_active = 1 AND sc.is_active = 1 AND c.is_active = 1
     ORDER BY c.position, sc.position, p.position
     LIMIT 100`
  );

  // Normalize image URLs: prefer absolute URLs, otherwise try Cloudinary when configured
  const mapped = rows.map((r) => {
    let image = r.image_url || null;
    try {
      if (image && typeof image === 'string') {
        const trimmed = image.trim();
        // Already a full URL
        if (/^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed) || trimmed.includes('res.cloudinary.com')) {
          image = trimmed;
        } else if (process.env.CLOUDINARY_CLOUD_NAME) {
          // Try to construct a Cloudinary URL. Normalize stored value to a plausible public_id
          let publicId = trimmed.replace(/^\//, '');
          // If path contains uploads/keep as-is, otherwise assume uploads/<name> may be used
          if (!publicId) publicId = '';
          try {
            image = getCloudinaryUrl(publicId || trimmed);
          } catch (e) {
            // fallback to original stored value
            image = trimmed;
          }
        } else {
          // fallback to local uploads path
          image = trimmed.startsWith('/') ? trimmed : `/uploads/${trimmed}`;
        }
      }
    } catch (e) {
      logger.warn('[WebsiteCache] Failed to normalize product image url:', e.message);
    }

    return {
      ...r,
      image_url: image,
      starting_price: Number(r.starting_price) || 0,
      has_paper_rate: !!r.has_paper_rate,
      paper_rate: Number(r.paper_rate) || 0,
      has_double_side_rate: !!r.has_double_side_rate,
      calculation_type: r.calculation_type || 'Normal'
    };
  });

  return mapped;
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
