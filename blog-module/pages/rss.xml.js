export default function Rss() { return null }

export async function getServerSideProps({ res, req }){
  const db = require('../lib/db')
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`
  const r = await db.query("SELECT title,slug,excerpt,content,published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 100")
  const posts = r.rows

  function esc(s){
    if(!s) return ''
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  const items = posts.map(p=>{
    const url = `${baseUrl}/blog/${p.slug}`
    const pubDate = p.published_at ? new Date(p.published_at).toUTCString() : new Date().toUTCString()
    return `
      <item>
        <title>${esc(p.title)}</title>
        <link>${url}</link>
        <guid>${url}</guid>
        <pubDate>${pubDate}</pubDate>
        <description>${esc(p.excerpt || '')}</description>
        <content:encoded><![CDATA[${p.content || ''}]]></content:encoded>
      </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
      <title>Sarga Printing Blog</title>
      <link>${baseUrl}/blog</link>
      <description>Guides and tips from Sarga Printing</description>
      <language>en-US</language>
      ${items}
    </channel>
  </rss>`

  res.setHeader('Content-Type','application/rss+xml')
  res.write(rss)
  res.end()
  return { props: {} }
}
