import db from '../../../../lib/db'

export default async function handler(req, res){
  if (req.method === 'GET'){
    const r = await db.query("SELECT id,title,slug,excerpt,featured_image,reading_time,published_at,status FROM posts WHERE status='published' ORDER BY published_at DESC")
    return res.json(r.rows)
  }
  if (req.method === 'POST'){
    const { title, slug, excerpt, content, featured_image, author_id, status, seo_title, seo_description, seo_keywords } = req.body
    const reading_time = Math.max(1, Math.round((content||'').split(/\s+/).length / 200))
    const published_at = status === 'published' ? new Date() : null
    const r = await db.query('INSERT INTO posts (title,slug,excerpt,content,featured_image,reading_time,author_id,status,published_at,seo_title,seo_description,seo_keywords) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [title,slug,excerpt,content,featured_image,reading_time,author_id,status,published_at,seo_title,seo_description,seo_keywords])
    return res.json(r.rows[0])
  }
  res.status(405).end()
}
