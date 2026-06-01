const express = require('express');
const crypto = require('crypto');
const { pool } = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../helpers/logger');

module.exports = (upload) => {
  const router = express.Router();

  // Simple async error handler wrapper
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // Utility to calculate reading time (200 words per minute average)
  const calculateReadTime = (content) => {
    const words = content ? content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length : 0;
    return Math.max(1, Math.ceil(words / 200));
  };

  // ─── PUBLIC ENDPOINTS ───

  // GET /api/blog/posts - Get list of published blog posts
  router.get('/posts', asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page || '1', 10) || 1;
    const limit = parseInt(req.query.limit || '10', 10) || 10;
    const offset = (page - 1) * limit;
    const category = req.query.category && String(req.query.category).trim();
    const tag = req.query.tag && String(req.query.tag).trim();
    const q = req.query.q && String(req.query.q).trim();

    let queryParams = [];
    // Only fetch published posts or scheduled posts that are already past their scheduled time
    let whereClause = `WHERE (p.status = 'Published' OR (p.status = 'Scheduled' AND p.scheduled_at <= NOW()))`;

    if (category) {
      whereClause += ` AND p.category = ?`;
      queryParams.push(category);
    }

    if (tag) {
      whereClause += ` AND FIND_IN_SET(?, p.tags) > 0`;
      queryParams.push(tag);
    }

    if (q) {
      whereClause += ` AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)`;
      const searchParam = `%${q}%`;
      queryParams.push(searchParam, searchParam, searchParam);
    }

    // Get count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM sarga_blog_posts p ${whereClause}`,
      queryParams
    );
    const total = countRows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Get posts
    const [posts] = await pool.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.featured_image, p.category, p.tags, p.views, 
              p.read_time, p.seo_title, p.seo_description, p.created_at, p.updated_at,
              a.name AS author_name, a.role AS author_role, a.avatar_url AS author_avatar
       FROM sarga_blog_posts p
       LEFT JOIN sarga_blog_authors a ON p.author_id = a.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  }));

  // GET /api/blog/posts/:slug - Get a single post by slug (and related posts)
  router.get('/posts/:slug', asyncHandler(async (req, res) => {
    const { slug } = req.params;
    
    // Retrieve post
    const [[post]] = await pool.query(
      `SELECT p.*, 
              a.name AS author_name, a.role AS author_role, a.bio AS author_bio, a.avatar_url AS author_avatar
       FROM sarga_blog_posts p
       LEFT JOIN sarga_blog_authors a ON p.author_id = a.id
       WHERE p.slug = ? AND (p.status = 'Published' OR (p.status = 'Scheduled' AND p.scheduled_at <= NOW()))`,
      [slug]
    );

    if (!post) {
      return res.status(404).json({ message: 'Blog post not found.' });
    }

    // Increment views asynchronously
    pool.query(`UPDATE sarga_blog_posts SET views = views + 1 WHERE id = ?`, [post.id])
      .catch(err => logger.error('[Blog] Failed to increment views:', err.message));

    // Track analytics event 'view'
    const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
    const userAgent = req.headers['user-agent'] || null;
    const referrer = req.headers['referer'] || null;

    pool.query(
      `INSERT INTO sarga_blog_analytics (post_id, event_type, user_agent, ip_hash, referrer) VALUES (?, ?, ?, ?, ?)`,
      [post.id, 'view', userAgent, ipHash, referrer]
    )
    .catch(err => logger.error('[Blog Analytics] Failed to track view:', err.message));

    // Load related posts (same category, excluding current, ordered by views, limit 3)
    const [related] = await pool.query(
      `SELECT id, title, slug, excerpt, featured_image, read_time, created_at
       FROM sarga_blog_posts
       WHERE category = ? AND id != ? AND (status = 'Published' OR (status = 'Scheduled' AND scheduled_at <= NOW()))
       ORDER BY views DESC
       LIMIT 3`,
      [post.category, post.id]
    );

    res.json({
      post,
      related
    });
  }));

  // POST /api/blog/posts/:id/track - Track share / read events
  router.post('/posts/:id/track', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { eventType } = req.body; // e.g. 'share_facebook', 'share_whatsapp', 'read_complete'

    if (!eventType) {
      return res.status(400).json({ message: 'Event type required.' });
    }

    const ipHash = crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex');
    const userAgent = req.headers['user-agent'] || null;
    const referrer = req.headers['referer'] || null;

    await pool.query(
      `INSERT INTO sarga_blog_analytics (post_id, event_type, user_agent, ip_hash, referrer) VALUES (?, ?, ?, ?, ?)`,
      [id, eventType, userAgent, ipHash, referrer]
    );

    res.json({ success: true });
  }));

  // GET /api/blog/categories - Get active blog categories & published post counts
  router.get('/categories', asyncHandler(async (req, res) => {
    const [categories] = await pool.query(
      `SELECT category, COUNT(*) AS count 
       FROM sarga_blog_posts 
       WHERE status = 'Published' OR (status = 'Scheduled' AND scheduled_at <= NOW())
       GROUP BY category 
       ORDER BY count DESC`
    );
    res.json({ categories });
  }));

  // ─── ADMIN ENDPOINTS (Requires authenticated Staff) ───

  // GET /api/blog/admin/posts - List all posts (including drafts/scheduled) for CMS table
  router.get('/admin/posts', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    const [posts] = await pool.query(
      `SELECT p.id, p.title, p.slug, p.status, p.scheduled_at, p.views, p.category, p.created_at,
              a.name AS author_name
       FROM sarga_blog_posts p
       LEFT JOIN sarga_blog_authors a ON p.author_id = a.id
       ORDER BY p.created_at DESC`
    );
    res.json({ posts });
  }));

  // POST /api/blog/admin/posts - Create new blog post
  router.post('/admin/posts', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    const { title, slug, excerpt, content, featured_image, category, tags, author_id, status, scheduled_at, seo_title, seo_description } = req.body;

    if (!title || !slug || !excerpt || !content || !category) {
      return res.status(400).json({ message: 'Title, slug, excerpt, content, and category are required.' });
    }

    const readTime = calculateReadTime(content);

    const [result] = await pool.query(
      `INSERT INTO sarga_blog_posts 
       (title, slug, excerpt, content, featured_image, category, tags, author_id, status, scheduled_at, read_time, seo_title, seo_description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, 
        slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''), 
        excerpt, 
        content, 
        featured_image || null, 
        category, 
        tags || null, 
        author_id || 1, 
        status || 'Draft', 
        scheduled_at ? new Date(scheduled_at) : null, 
        readTime, 
        seo_title || title, 
        seo_description || excerpt
      ]
    );

    res.status(201).json({ success: true, postId: result.insertId });
  }));

  // PUT /api/blog/admin/posts/:id - Update existing blog post
  router.put('/admin/posts/:id', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, slug, excerpt, content, featured_image, category, tags, author_id, status, scheduled_at, seo_title, seo_description } = req.body;

    if (!title || !slug || !excerpt || !content || !category) {
      return res.status(400).json({ message: 'Title, slug, excerpt, content, and category are required.' });
    }

    const readTime = calculateReadTime(content);

    await pool.query(
      `UPDATE sarga_blog_posts 
       SET title = ?, slug = ?, excerpt = ?, content = ?, featured_image = ?, category = ?, 
           tags = ?, author_id = ?, status = ?, scheduled_at = ?, read_time = ?, seo_title = ?, seo_description = ? 
       WHERE id = ?`,
      [
        title, 
        slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''), 
        excerpt, 
        content, 
        featured_image || null, 
        category, 
        tags || null, 
        author_id || 1, 
        status || 'Draft', 
        scheduled_at ? new Date(scheduled_at) : null, 
        readTime, 
        seo_title || title, 
        seo_description || excerpt,
        id
      ]
    );

    res.json({ success: true });
  }));

  // DELETE /api/blog/admin/posts/:id - Delete a blog post
  router.delete('/admin/posts/:id', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    const { id } = req.params;
    await pool.query(`DELETE FROM sarga_blog_posts WHERE id = ?`, [id]);
    res.json({ success: true });
  }));

  // GET /api/blog/admin/authors - Get all authors for selectors
  router.get('/admin/authors', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    const [authors] = await pool.query(`SELECT id, name, role, avatar_url FROM sarga_blog_authors ORDER BY name`);
    res.json({ authors });
  }));

  // POST /api/blog/admin/authors - Create a new author profile
  router.post('/admin/authors', authenticate, requireRole(['Admin']), asyncHandler(async (req, res) => {
    const { name, role, bio, avatar_url } = req.body;
    if (!name || !role) {
      return res.status(400).json({ message: 'Name and role are required.' });
    }
    const [result] = await pool.query(
      `INSERT INTO sarga_blog_authors (name, role, bio, avatar_url) VALUES (?, ?, ?, ?)`,
      [name, role, bio || null, avatar_url || null]
    );
    res.status(201).json({ success: true, authorId: result.insertId });
  }));

  // GET /api/blog/admin/analytics - Summarize blog metrics
  router.get('/admin/analytics', authenticate, requireRole(['Admin', 'Designer', 'Accountant']), asyncHandler(async (req, res) => {
    // 1. Total views & posts count
    const [[viewsAndPosts]] = await pool.query(
      `SELECT SUM(views) AS total_views, COUNT(*) AS total_posts FROM sarga_blog_posts`
    );

    // 2. Shares aggregation
    const [[sharesCount]] = await pool.query(
      `SELECT COUNT(*) AS total_shares FROM sarga_blog_analytics WHERE event_type LIKE 'share_%'`
    );

    // 3. Top posts
    const [topPosts] = await pool.query(
      `SELECT id, title, slug, views, category, created_at 
       FROM sarga_blog_posts 
       ORDER BY views DESC 
       LIMIT 5`
    );

    // 4. Social share channels breakdown
    const [sharesBreakdown] = await pool.query(
      `SELECT event_type, COUNT(*) AS count 
       FROM sarga_blog_analytics 
       WHERE event_type LIKE 'share_%' 
       GROUP BY event_type 
       ORDER BY count DESC`
    );

    // 5. Views over the last 14 days
    const [viewsOverTime] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS views 
       FROM sarga_blog_analytics 
       WHERE event_type = 'view' AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json({
      summary: {
        totalViews: viewsAndPosts.total_views || 0,
        totalPosts: viewsAndPosts.total_posts || 0,
        totalShares: sharesCount.total_shares || 0
      },
      topPosts,
      sharesBreakdown,
      viewsOverTime
    });
  }));

  return router;
};
