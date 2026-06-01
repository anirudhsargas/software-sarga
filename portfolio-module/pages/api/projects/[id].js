import db from '../../../../lib/db'

export default async function handler(req, res){
  const { method } = req
  const { id } = req.query
  if (method === 'GET'){
    const r = await db.query('SELECT * FROM projects WHERE id=$1', [id])
    if (r.rows.length===0) return res.status(404).end()
    const p = r.rows[0]
    p.images = JSON.parse(p.images||'[]')
    return res.json(p)
  }
  if (method === 'DELETE'){
    await db.query('DELETE FROM projects WHERE id=$1', [id])
    return res.status(204).end()
  }
  res.status(405).end()
}
