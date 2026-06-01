import { NextResponse } from 'next/server'
import { loadAll } from '../../lib/i18n'

export async function GET(req, { params }){
  const lang = params.lang || 'en'
  const t = loadAll(lang)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`

  // static localized pages
  const urls = [
    `${baseUrl}/${lang}`,
    `${baseUrl}/${lang}/products`,
    `${baseUrl}/${lang}/blog`,
    `${baseUrl}/${lang}/contact`
  ]

  // try to include blog posts from blog-module if available
  try{
    const db = require(process.cwd() + '/blog-module/lib/db')
    const r = await db.query("SELECT slug, published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 1000")
    for (const row of r.rows){
      urls.push(`${baseUrl}/${lang}/blog/${row.slug}`)
    }
  }catch(e){ /* ignore if blog module not present */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n${urls.map(u=>`<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } })
}
