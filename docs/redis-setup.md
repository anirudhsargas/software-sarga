# Redis Setup Guide

## Overview

Redis is used as a distributed cache to speed up API responses and reduce database load. The system falls back gracefully to in-memory caching (NodeCache) when Redis is unavailable.

## Local Development

### Option 1: Docker (Recommended)

```bash
docker run -d --name sarga-redis -p 6379:6379 redis:7-alpine
```

### Option 2: Install Redis locally

**Windows:**
```bash
# Using WSL2
wsl sudo apt install redis-server
wsl sudo service redis-server start
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt install redis-server
sudo systemctl start redis
```

### Verify Redis is running

```bash
redis-cli ping
# Should return: PONG
```

### Environment Variables

Add to your `.env` file:

```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_ENABLED=true
```

## Production (Managed Redis)

### Render

1. Create a Redis instance in Render dashboard
2. Copy the Internal Redis URL
3. Set `REDIS_URL` environment variable

### Upstash (Serverless Redis)

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database
3. Copy the REST URL and token
4. Set `REDIS_URL` in your environment

### Redis Cloud

1. Create a free database at [redis.com](https://redis.com)
2. Copy the connection string
3. Set `REDIS_URL` environment variable

## Architecture

```
Request → Cache Middleware → Redis → Express Handler → Response → Cache Store
                ↓ (miss)
         Express Handler → Response → Cache Store
```

### Cache TTLs

| Data Type | TTL | Prefix |
|-----------|-----|--------|
| Dashboard | 300s (5 min) | `sarga:dashboard:` |
| Customer List | 120s (2 min) | `sarga:customers:` |
| Analytics | 600s (10 min) | `sarga:analytics:` |
| Search | 60s (1 min) | `sarga:search:` |

### Cache Invalidation

| Event | Keys Cleared |
|-------|-------------|
| Customer add/edit/delete | `sarga:customers:*` |
| Order updates | `sarga:dashboard:*` |
| Payment updates | `sarga:analytics:*` |

## Files

| File | Purpose |
|------|---------|
| `server/config/redis.js` | Redis client connection, health check, graceful shutdown |
| `server/services/cacheService.js` | Cache get/set/delete, pattern invalidation, TTL config |
| `server/middleware/cache.js` | Express middleware for route-level caching |

## Health Check

```
GET /api/health/redis
```

Response:
```json
{
  "status": "connected",
  "latency": "2 ms"
}
```

## Troubleshooting

### Redis won't connect

1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
3. Check firewall allows port 6379
4. If using password, verify `REDIS_PASSWORD`

### High memory usage

- Keys auto-expire via TTL
- Monitor with: `redis-cli info memory`
- Check key count: `redis-cli dbsize`

### Connection pool exhausted

The client uses auto-reconnect with exponential backoff. If issues persist:
- Increase Redis `maxclients` setting
- Check for connection leaks in application code

### Redis unavailable (graceful fallback)

When Redis is down, the system automatically falls back to in-memory NodeCache. No code changes needed — just note that:
- Cache is per-process (not shared across instances)
- Cache is lost on restart
