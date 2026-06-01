# Sarga Portfolio Module

This folder contains a self-contained Next.js module for the Sarga Printing portfolio gallery.

Quick start:

1. Copy into your monorepo or run in its own folder.
2. Install dependencies: `npm install`.
3. Set environment variables (see `.env.example`).
4. Run migrations against your Postgres DB, then `npm run dev`.

Features implemented in scaffold:
- Responsive masonry gallery (CSS columns)
- Category filters and search
- Cloudinary upload API for admin
- Before/After component
- Image modal with zoom navigation
- PostgreSQL schema migration
