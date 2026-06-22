# Deployment Guide

## Architecture

```
Internet → NGINX (80/443) → React (3000) + Express (5000) → MySQL + Redis
```

## Local Development

```bash
# Start Redis
docker run -d --name sarga-redis -p 6379:6379 redis:7-alpine

# Start full stack
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- API: http://localhost:3000/api

## Render Deployment

Render does not support NGINX directly. Use Render's built-in routing.

### Backend Service

1. Add Redis addon in Render dashboard
2. Set environment variables:
   - `REDIS_URL` (from addon)
   - `CACHE_ENABLED=true`
3. Deploy normally

### Frontend (Static Site)

Already deployed to Vercel. No changes needed.

## VPS / DigitalOcean Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install NGINX
sudo apt install nginx -y

# Install Redis
sudo apt install redis-server -y
sudo systemctl enable redis
```

### 2. Deploy Application

```bash
# Clone repo
git clone <repo-url> /opt/sarga
cd /opt/sarga

# Install dependencies
cd server && npm ci --production
cd ../client && npm ci && npm run build
cd ..

# Set environment variables
cp .env.example .env
nano .env  # Edit with production values

# Start with PM2
npm install -g pm2
pm2 start server/index.js --name sarga-backend
pm2 save
pm2 startup
```

### 3. Configure NGINX

```bash
sudo cp deployment/nginx.conf /etc/nginx/conf.d/sarga.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 5. Redis Security

```bash
# Set Redis password
sudo nano /etc/redis/redis.conf
# Add: requirepass your-secure-password

# Restart Redis
sudo systemctl restart redis
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | - | Full Redis connection URL |
| `REDIS_HOST` | No | 127.0.0.1 | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password |
| `CACHE_ENABLED` | No | true | Enable/disable Redis caching |
| `NGINX_PORT` | No | 80 | NGINX listen port |
| `PORT` | Yes | 3000 | Express server port |

## Monitoring

### Health Checks

```bash
# Backend health
curl http://localhost:3000/api/health

# Redis health
curl http://localhost:3000/api/health/redis

# Database ping
curl http://localhost:3000/api/ping
```

### PM2 Monitoring

```bash
pm2 status
pm2 logs sarga-backend
pm2 monit
```

### Redis Monitoring

```bash
redis-cli info stats
redis-cli info memory
redis-cli monitor  # Live command log (debug only)
```

## Troubleshooting

### Redis connection fails

1. Check Redis is running: `redis-cli ping`
2. Verify password if set
3. Check firewall: `sudo ufw allow 6379`
4. Logs: `journalctl -u redis`

### NGINX 502 errors

1. Check backend: `pm2 status`
2. Check NGINX upstream: `sudo nginx -t`
3. Restart backend: `pm2 restart sarga-backend`

### High memory usage

1. Check Redis: `redis-cli info memory`
2. Check Node.js: `pm2 monit`
3. Scale horizontally if needed

### Cache not working

1. Verify `CACHE_ENABLED=true`
2. Check Redis health: `curl /api/health/redis`
3. Check logs for `[Redis]` messages
4. Fallback to in-memory cache is automatic

## Performance Tuning

### Redis

- Set `maxmemory` in redis.conf
- Use `allkeys-lru` eviction policy
- Monitor hit rate: `redis-cli info stats | grep keyspace`

### NGINX

- Adjust `worker_processes` to CPU cores
- Enable `sendfile` and `tcp_nopush`
- Tune `keepalive_timeout`

### Node.js

- Set `NODE_ENV=production`
- Use `--max-old-space-size=4096` for large heaps
- Enable cluster mode for multi-core usage
