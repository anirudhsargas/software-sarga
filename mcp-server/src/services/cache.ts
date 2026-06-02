/**
 * Sarga Prints MCP Server — Simple In-Memory Query Cache
 */
import logger from '../utils/logger.js';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;

/**
 * Get a cached value if it exists and hasn't expired.
 */
export function cacheGet<T = unknown>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/**
 * Store a value in cache with optional TTL (ms).
 */
export function cacheSet(key: string, data: unknown, ttlMs = DEFAULT_TTL): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Invalidate cache entries matching a pattern (substring match).
 */
export function cacheInvalidate(pattern: string): number {
  let count = 0;
  for (const key of store.keys()) {
    if (key.includes(pattern)) {
      store.delete(key);
      count++;
    }
  }
  if (count > 0) {
    logger.debug(`[Cache] Invalidated ${count} entries matching '${pattern}'`);
  }
  return count;
}

/**
 * Clear all cached entries.
 */
export function cacheClear(): void {
  const size = store.size;
  store.clear();
  logger.debug(`[Cache] Cleared all ${size} entries`);
}

/**
 * Get cache statistics.
 */
export function cacheStats(): { size: number; keys: string[] } {
  // Prune expired entries first
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
  return { size: store.size, keys: Array.from(store.keys()) };
}

/**
 * Helper: wrap an async function with caching.
 * Use as: const result = await cached('my-key', () => expensiveQuery());
 */
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  const data = await fn();
  cacheSet(key, data, ttlMs);
  return data;
}
