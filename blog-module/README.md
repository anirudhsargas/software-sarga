# Sarga Blog Module

This module provides a CMS-style blog with SEO features for Sarga Printing.

Quick start:

1. Install dependencies: `npm install` in `blog-module`.
2. Set `DATABASE_URL` in environment.
3. Apply migration: run the SQL in `migrations/001_create_blog_schema.sql`.
4. Start dev server: `npm run dev`.

Included features:
- SEO-friendly post pages with JSON-LD structured data
- Reading time estimation
- Admin editor (draft/scheduled/published), SEO metadata fields
- Tags management API
- Related posts and search (basic)
