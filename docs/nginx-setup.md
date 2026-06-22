# NGINX Setup Guide

## Overview

NGINX serves as a reverse proxy, handling:
- Static file serving for React frontend
- API proxying to Express backend
- Gzip/Brotli compression
- SSL termination
- Security headers
- WebSocket support

## Local Development

NGINX is not required locally. Use:
- `npm run dev` at root for full stack
- Vite dev server handles frontend hot-reload

## Production Installation

### Ubuntu/Debian

```bash
sudo apt update && sudo apt install nginx
sudo systemctl enable nginx
```

### CentOS/RHEL

```bash
sudo yum install epel-release
sudo yum install nginx
sudo systemctl enable nginx
```

### Docker

```bash
docker run -d --name sarga-nginx \
  -p 80:80 -p 443:443 \
  -v ./deployment/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  -v ./client/dist:/usr/share/nginx/html:ro \
  nginx:alpine
```

## Configuration

### 1. Copy the config

```bash
sudo cp deployment/nginx.conf /etc/nginx/conf.d/sarga.conf
```

### 2. Update upstream servers

Edit the config to point to your actual backend/frontend ports:

```nginx
upstream frontend {
    server 127.0.0.1:3000;  # React dev server or static files
    keepalive 64;
}

upstream backend {
    server 127.0.0.1:5000;  # Express server
    keepalive 64;
}
```

### 3. Test and reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS Setup

### Using Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Manual SSL

1. Place certificates in `/etc/nginx/ssl/`
2. Uncomment SSL lines in the config
3. Reload NGINX

## Features

### Compression

- **Gzip**: Enabled by default for text, JSON, JS, CSS, SVG
- **Brotli**: Uncomment if nginx module is installed (better compression)

### Browser Caching

| Asset Type | Cache Duration |
|-----------|---------------|
| JS/CSS (hashed) | 1 year |
| Fonts | 1 year |
| Images | 1 year |
| API responses | No cache (Redis handles) |

### Security Headers

| Header | Value |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| HSTS | max-age=31536000 |
| Server Tokens | Hidden |

### Upload Support

- Max body size: 50MB
- Supports large image/design uploads

### Timeouts

| Setting | Value |
|---------|-------|
| Connect | 60s |
| Send | 60s |
| Read | 60s |
| WebSocket | 86400s |

## Health Check

```
GET /health/nginx
```

Returns nginx status and proxy reachability.

## Troubleshooting

### 502 Bad Gateway

- Backend server is not running
- Upstream port is wrong
- Check: `sudo systemctl status nginx` and backend logs

### 504 Gateway Timeout

- Backend is too slow or unresponsive
- Increase `proxy_read_timeout` if needed
- Check backend health: `curl http://localhost:5000/api/ping`

### Static files not loading

- Verify React build exists: `ls client/dist/`
- Check file permissions
- Update `root` directive if serving from different path

### WebSocket not connecting

- Ensure `/ws` location block is configured
- Check proxy headers include `Upgrade` and `Connection`

### Large file upload fails

- `client_max_body_size` must match or exceed backend limits
- Default: 50MB (matches Express config)
