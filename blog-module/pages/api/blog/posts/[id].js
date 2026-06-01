import db from '../../../../lib/db'

export default async function handler(req, res){
  const { id } = req.query
  if (req.method === 'GET'){
    const r = await db.query('SELECT * FROM posts WHERE id=$1', [id])
    if (r.rows.length===0) return res.status(404).end()
    return res.json(r.rows[0])
  }
  if (req.method === 'PUT'){
    const { title, slug, excerpt, content, featured_image, author_id, status, seo_title, seo_description, seo_keywords, published_at } = req.body
    const reading_time = Math.max(1, Math.round((content||'').split(/\s+/).length / 200))
    const r = await db.query('UPDATE posts SET title=$1,slug=$2,excerpt=$3,content=$4,featured_image=$5,reading_time=$6,author_id=$7,status=$8,published_at=$9,seo_title=$10,seo_description=$11,seo_keywords=$12,updated_at=now() WHERE id=$13 RETURNING *', [title,slug,excerpt,content,featured_image,reading_time,author_id,status,published_at,seo_title,seo_description,seo_keywords,id])
    return res.json(r.rows[0])
  }
  if (req.method === 'DELETE'){
    await db.query('DELETE FROM posts WHERE id=$1', [id])
    return res.status(204).end()
  }
  res.status(405).end()
}
