import db from '../../../lib/db'

export default async function handler(req, res){
  const { method, query } = req
  if (method === 'GET'){
    const slug = query.slug
    if (slug){
      const result = await db.query('SELECT * FROM projects WHERE slug=$1 LIMIT 1', [slug])
      if (result.rows.length === 0) return res.json([])
      const project = result.rows[0]
      project.images = JSON.parse(project.images || '[]')
      return res.json([project])
    }
    const r = await db.query('SELECT * FROM projects ORDER BY featured DESC, position ASC')
    const rows = r.rows.map(r=>({ ...r, images: JSON.parse(r.images||'[]') }))
    return res.json(rows)
  }
  res.status(405).end()
}
