import db from '../../../../lib/db'

export default async function handler(req, res){
  if (req.method === 'GET'){
    const r = await db.query('SELECT * FROM tags ORDER BY name')
    return res.json(r.rows)
  }
  if (req.method === 'POST'){
    const { name, slug } = req.body
    const r = await db.query('INSERT INTO tags (name,slug) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET slug=EXCLUDED.slug RETURNING *', [name,slug])
    return res.json(r.rows[0])
  }
  res.status(405).end()
}
