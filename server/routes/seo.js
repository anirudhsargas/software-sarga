const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// ─── GET /sitemap.xml ───
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.SITE_URL || 'https://sarga.in';
    const now = new Date().toISOString().slice(0, 10);

    // Static pages
    const staticPages = ['', 'services', 'products', 'blog', 'contact', 'track', 'artwork-upload', 'samples', 'book', 'design', 'privacy', 'terms', 'portfolio'];

    let urls = staticPages.map(p => `
  <url>
    <loc>${baseUrl}/${p}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p === '' ? 'daily' : 'weekly'}</changefreq>
    <priority>${p === '' ? '1.0' : '0.8'}</priority>
  </url>`);

    // Blog posts
    const [posts] = await pool.query("SELECT slug, updated_at FROM sarga_blog_posts WHERE status = 'Published' ORDER BY updated_at DESC LIMIT 200");
    for (const p of posts) {
      const lm = p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : now;
      urls.push(`
  <url>
    <loc>${baseUrl}/blog/${p.slug}</loc>
    <lastmod>${lm}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    // Products
    const [products] = await pool.query("SELECT id, name, updated_at FROM sarga_products WHERE is_active = 1 ORDER BY id LIMIT 200");
    for (const p of products) {
      urls.push(`
  <url>
    <loc>${baseUrl}/products#product-${p.id}</loc>
    <lastmod>${p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`);
    }

    // Portfolio
    const [projects] = await pool.query("SELECT slug, updated_at FROM sarga_portfolio_projects WHERE published = 1 ORDER BY id LIMIT 200");
    for (const p of projects) {
      const lm = p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : now;
      urls.push(`
  <url>
    <loc>${baseUrl}/portfolio/${p.slug}</loc>
    <lastmod>${lm}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`);
    }

    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('')}
</urlset>`);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

// ─── GET /robots.txt ───
router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.SITE_URL || 'https://sarga.in';
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /portal/
Disallow: /design/
Disallow: /admin/

Sitemap: ${baseUrl}/sitemap.xml
`);
});

module.exports = router;
