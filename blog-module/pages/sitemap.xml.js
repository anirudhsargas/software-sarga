export default function Sitemap() { return null }

export async function getServerSideProps({ res, req }){
  const db = require('../lib/db')
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`
  const r = await db.query("SELECT slug, updated_at, published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 1000")
  const posts = r.rows

  const urls = []
  // home and blog index
  urls.push({ loc: `${baseUrl}/`, lastmod: new Date().toISOString() })
  urls.push({ loc: `${baseUrl}/blog`, lastmod: new Date().toISOString() })

  for (const p of posts){
    const lastmod = p.updated_at || p.published_at || new Date().toISOString()
    urls.push({ loc: `${baseUrl}/blog/${p.slug}`, lastmod: new Date(lastmod).toISOString() })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls.map(u=>`<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
  </urlset>`

  res.setHeader('Content-Type','application/xml')
  res.write(xml)
  res.end()
  return { props: {} }
}
