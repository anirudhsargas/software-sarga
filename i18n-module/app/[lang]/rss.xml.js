import { NextResponse } from 'next/server'
import { loadAll } from '../../lib/i18n'

export async function GET(req, { params }){
  const lang = params.lang || 'en'
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`
  const t = loadAll(lang)

  let items = []
  try{
    const db = require(process.cwd() + '/blog-module/lib/db')
    const r = await db.query("SELECT title,slug,excerpt,content,published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 100")
    items = r.rows.map(p=> ({ title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, pubDate: p.published_at }))
  }catch(err){ /* ignore */ }

  function esc(s){ if(!s) return '' ; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

  const xmlItems = items.map(p=>{
    const url = `${baseUrl}/${lang}/blog/${p.slug}`
    const pubDate = p.pubDate ? new Date(p.pubDate).toUTCString() : new Date().toUTCString()
    return `\n  <item>\n    <title>${esc(p.title)}</title>\n    <link>${url}</link>\n    <guid>${url}</guid>\n    <pubDate>${pubDate}</pubDate>\n    <description>${esc(p.excerpt || '')}</description>\n    <content:encoded><![CDATA[${p.content || ''}]]></content:encoded>\n  </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n  <channel>\n    <title>${t.common?.seo?.title || 'Sarga Blog'}</title>\n    <link>${baseUrl}/${lang}/blog</link>\n    <description>${t.common?.seo?.description || 'Blog'}</description>\n    ${xmlItems}\n  </channel>\n</rss>`

  return new NextResponse(rss, { headers: { 'Content-Type': 'application/rss+xml' } })
}
